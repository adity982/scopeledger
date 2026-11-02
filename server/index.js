import './config.js';
import express from 'express';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { db, id, now, allProjects, getProject, getRequest, getClientRequest, projectRequests, serializeRequest, seedSample } from './db.js';
import { analyze } from './analysis.js';
import { paypalConfigured, createDraftInvoice, sendInvoice, getInvoice, verifyWebhook, paidStatus } from './paypal.js';

const app = express();
const production = process.env.NODE_ENV === 'production';
const demoMode = process.env.DEMO_MODE === 'true' || (!production && process.env.DEMO_MODE !== 'false');
if (production && !process.env.ADMIN_TOKEN) throw new Error('Set ADMIN_TOKEN before running a public deployment');
app.disable('x-powered-by');
app.use(express.json({ limit: '128kb' }));

function problem(res, status, message) { return res.status(status).json({ error: message }); }
function safe(handler) { return (req, res, next) => Promise.resolve(handler(req, res)).catch(next); }
function admin(req, res, next) {
  if (!process.env.ADMIN_TOKEN || req.get('authorization') === `Bearer ${process.env.ADMIN_TOKEN}`) return next();
  return problem(res, 401, 'Admin token required');
}
function text(value, max = 10000) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value || ''); }
function requestDetail(requestId) {
  const row = getRequest(requestId);
  return row && { ...serializeRequest(row), project: getProject(row.project_id) };
}

app.get('/api/config', (_req, res) => res.json({
  aiConfigured: Boolean(process.env.OPENAI_API_KEY),
  paypalConfigured: paypalConfigured(),
  demoMode,
  adminProtected: Boolean(process.env.ADMIN_TOKEN)
}));

app.post('/api/webhooks/paypal', safe(async (req, res) => {
  if (!await verifyWebhook(req.headers, req.body)) return problem(res, 400, 'Invalid PayPal signature');
  const event = req.body;
  if (!event?.id || !event?.event_type) return problem(res, 400, 'Invalid event');
  if (db.prepare('SELECT id FROM webhook_events WHERE id=?').get(event.id)) return res.json({ ok: true, duplicate: true });
  const invoiceId = event.resource?.id;
  if (typeof invoiceId === 'string' && /^INV2-[A-Z0-9-]+$/.test(invoiceId)) {
    const row = db.prepare('SELECT * FROM requests WHERE invoice_id=? AND invoice_provider=?').get(invoiceId, 'paypal');
    if (row) {
      const invoice = await getInvoice(invoiceId);
      const status = paidStatus(invoice.status) ? 'paid' : invoice.status === 'DRAFT' ? row.status : 'invoiced';
      db.prepare('UPDATE requests SET invoice_status=?, status=?, updated_at=? WHERE id=?').run(invoice.status, status, now(), row.id);
    }
  }
  db.prepare('INSERT INTO webhook_events VALUES (?,?,?)').run(event.id, event.event_type, now());
  res.json({ ok: true });
}));

app.get('/api/client/:token', (req, res) => {
  const row = getClientRequest(req.params.token);
  if (!row || !['proposed','accepted','invoiced','paid'].includes(row.status)) return problem(res, 404, 'Review link not found');
  const project = getProject(row.project_id);
  res.json({ title: row.title, work_description: row.work_description, hours: row.hours, amount: row.amount,
    currency: project.currency, project_name: project.name, client_name: project.client_name,
    status: row.status, accepted_name: row.accepted_name, accepted_at: row.accepted_at,
    invoice_url: row.invoice_url, invoice_provider: row.invoice_provider, invoice_status: row.invoice_status });
});

app.post('/api/client/:token/accept', (req, res) => {
  const row = getClientRequest(req.params.token);
  if (!row) return problem(res, 404, 'Review link not found');
  if (row.status !== 'proposed') return problem(res, 409, 'This change order is no longer awaiting approval');
  const name = text(req.body?.name, 120);
  if (name.length < 2 || req.body?.accepted !== true) return problem(res, 400, 'Enter your name and confirm the change');
  db.prepare("UPDATE requests SET status='accepted',accepted_name=?,accepted_at=?,updated_at=? WHERE id=?")
    .run(name, now(), now(), row.id);
  res.json({ ok: true });
});

app.use('/api', admin);

app.get('/api/projects', (_req, res) => res.json(allProjects()));
app.post('/api/sample', (req, res) => {
  if (!demoMode) return problem(res, 403, 'Sample data is disabled');
  res.json({ id: seedSample() });
});
app.post('/api/projects', (req, res) => {
  const name = text(req.body?.name, 140);
  const clientName = text(req.body?.client_name, 140);
  const clientEmail = text(req.body?.client_email, 254);
  const scope = text(req.body?.scope, 20000);
  const rate = Number(req.body?.rate);
  const currency = text(req.body?.currency || 'USD', 3).toUpperCase();
  if (!name || !clientName || !validEmail(clientEmail) || scope.length < 20 || !Number.isFinite(rate) || rate <= 0 || rate > 100000 || !/^[A-Z]{3}$/.test(currency)) {
    return problem(res, 400, 'Provide a project name, client, valid email, scope, positive rate, and three-letter currency');
  }
  const projectId = id();
  db.prepare('INSERT INTO projects VALUES (?,?,?,?,?,?,?,?)').run(projectId, name, clientName, clientEmail, scope, rate, currency, now());
  res.status(201).json(getProject(projectId));
});
app.get('/api/projects/:id', (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return problem(res, 404, 'Project not found');
  res.json({ ...project, requests: projectRequests(project.id).map(serializeRequest) });
});

async function githubIssue(url) {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)\/?$/.exec(url);
  if (!match) throw new Error('Use a public GitHub issue URL, such as https://github.com/owner/repo/issues/12');
  const [, owner, repo, number] = match;
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${number}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ScopeLedger-demo' }
  });
  if (!response.ok) throw new Error(`GitHub issue could not be read (${response.status})`);
  const issue = await response.json();
  if (issue.pull_request) throw new Error('This URL points to a pull request, not an issue');
  return { title: text(issue.title, 180), body: text(issue.body, 12000) };
}

app.post('/api/projects/:id/requests', safe(async (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return problem(res, 404, 'Project not found');
  const sourceUrl = text(req.body?.source_url, 500);
  const fromGithub = sourceUrl ? await githubIssue(sourceUrl) : null;
  const title = fromGithub?.title || text(req.body?.title, 180);
  const body = fromGithub?.body || text(req.body?.body, 12000);
  if (!title || body.length < 10) return problem(res, 400, 'Provide a request title and at least 10 characters of detail');
  const requestId = id();
  const time = now();
  db.prepare('INSERT INTO requests (id,project_id,title,body,source_url,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
    .run(requestId, project.id, title, body, sourceUrl || null, time, time);
  res.status(201).json(requestDetail(requestId));
}));
app.get('/api/requests/:id', (req, res) => {
  const detail = requestDetail(req.params.id);
  return detail ? res.json(detail) : problem(res, 404, 'Request not found');
});
app.post('/api/requests/:id/analyze', safe(async (req, res) => {
  const row = getRequest(req.params.id);
  if (!row) return problem(res, 404, 'Request not found');
  if (!['new','analyzed'].includes(row.status)) return problem(res, 409, 'This request is already in the approval flow');
  const project = getProject(row.project_id);
  const result = await analyze(project.scope, row.body);
  db.prepare("UPDATE requests SET analysis_json=?,status='analyzed',work_description=?,hours=?,amount=?,updated_at=? WHERE id=?")
    .run(JSON.stringify(result), result.suggested_deliverable, result.suggested_hours,
      Math.round(result.suggested_hours * project.rate * 100) / 100, now(), row.id);
  res.json(requestDetail(row.id));
}));
app.patch('/api/requests/:id', (req, res) => {
  const row = getRequest(req.params.id);
  if (!row) return problem(res, 404, 'Request not found');
  if (!['new','analyzed'].includes(row.status)) return problem(res, 409, 'Approved change orders cannot be edited');
  const description = text(req.body?.work_description, 2000);
  const hours = Number(req.body?.hours);
  const project = getProject(row.project_id);
  if (description.length < 10 || !Number.isFinite(hours) || hours <= 0 || hours > 1000) return problem(res, 400, 'Enter a description and a positive estimate of hours');
  db.prepare('UPDATE requests SET work_description=?,hours=?,amount=?,updated_at=? WHERE id=?')
    .run(description, hours, Math.round(hours * project.rate * 100) / 100, now(), row.id);
  res.json(requestDetail(row.id));
});
app.post('/api/requests/:id/propose', (req, res) => {
  const row = getRequest(req.params.id);
  if (!row) return problem(res, 404, 'Request not found');
  if (row.status !== 'analyzed' || !row.work_description || !row.amount || row.amount <= 0) return problem(res, 409, 'Analyze and price this request first');
  const token = randomBytes(24).toString('hex');
  db.prepare("UPDATE requests SET status='proposed',client_token=?,updated_at=? WHERE id=?").run(token, now(), row.id);
  res.json(requestDetail(row.id));
});
app.post('/api/requests/:id/invoice', safe(async (req, res) => {
  const row = getRequest(req.params.id);
  if (!row) return problem(res, 404, 'Request not found');
  if (row.status !== 'accepted') return problem(res, 409, 'Client acceptance is required before invoicing');
  const project = getProject(row.project_id);
  if (!paypalConfigured()) return problem(res, 503, 'Configure PayPal sandbox credentials to create a real invoice');
  let invoiceId = row.invoice_id;
  if (!invoiceId) {
    invoiceId = await createDraftInvoice(project, row);
    db.prepare("UPDATE requests SET invoice_id=?,invoice_provider='paypal',invoice_status='DRAFT',updated_at=? WHERE id=?")
      .run(invoiceId, now(), row.id);
  }
  const invoice = await sendInvoice(invoiceId);
  db.prepare("UPDATE requests SET status='invoiced',invoice_id=?,invoice_url=?,invoice_provider='paypal',invoice_status=?,updated_at=? WHERE id=?")
    .run(invoice.id, invoice.url, invoice.status, now(), row.id);
  res.json(requestDetail(row.id));
}));
app.post('/api/requests/:id/sync', safe(async (req, res) => {
  const row = getRequest(req.params.id);
  if (!row) return problem(res, 404, 'Request not found');
  if (!row.invoice_id || row.invoice_provider !== 'paypal') return problem(res, 409, 'No PayPal invoice exists');
  const invoice = await getInvoice(row.invoice_id);
  const status = paidStatus(invoice.status) ? 'paid' : 'invoiced';
  db.prepare('UPDATE requests SET status=?,invoice_status=?,invoice_url=?,updated_at=? WHERE id=?')
    .run(status, invoice.status, invoice.detail?.metadata?.recipient_view_url || invoice.metadata?.recipient_view_url || row.invoice_url, now(), row.id);
  res.json(requestDetail(row.id));
}));

if (!production) {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
} else {
  app.use(express.static(resolve('dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')));
}

app.use((error, _req, res, _next) => {
  console.error(error);
  problem(res, 500, error.message || 'Unexpected server error');
});

const port = Number(process.env.PORT || 4173);
app.listen(port, production ? '0.0.0.0' : '127.0.0.1', () => console.log(`ScopeLedger at http://localhost:${port}`));
