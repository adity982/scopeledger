import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const path = resolve(process.env.DATABASE_PATH || './data/scopeledger.sqlite');
mkdirSync(dirname(path), { recursive: true });
export const db = new DatabaseSync(path);
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, client_name TEXT NOT NULL,
    client_email TEXT NOT NULL, scope TEXT NOT NULL, rate REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD', created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL, body TEXT NOT NULL, source_url TEXT,
    status TEXT NOT NULL DEFAULT 'new', analysis_json TEXT,
    work_description TEXT, hours REAL, amount REAL,
    client_token TEXT UNIQUE, accepted_name TEXT, accepted_at TEXT,
    invoice_id TEXT, invoice_url TEXT, invoice_provider TEXT,
    invoice_status TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS webhook_events (
    id TEXT PRIMARY KEY, event_type TEXT NOT NULL, received_at TEXT NOT NULL
  );
`);

export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export const allProjects = () => db.prepare(`
  SELECT p.*, COUNT(r.id) AS request_count
  FROM projects p LEFT JOIN requests r ON r.project_id=p.id
  GROUP BY p.id ORDER BY p.created_at DESC
`).all();
export const getProject = (projectId) => db.prepare('SELECT * FROM projects WHERE id=?').get(projectId);
export const getRequest = (requestId) => db.prepare('SELECT * FROM requests WHERE id=?').get(requestId);
export const getClientRequest = (token) => db.prepare('SELECT * FROM requests WHERE client_token=?').get(token);
export const projectRequests = (projectId) => db.prepare('SELECT * FROM requests WHERE project_id=? ORDER BY created_at DESC').all(projectId);

export function serializeRequest(row) {
  if (!row) return null;
  return { ...row, analysis: row.analysis_json ? JSON.parse(row.analysis_json) : null };
}

export function seedSample() {
  const existing = db.prepare("SELECT id FROM projects WHERE name='Northstar Studio · Checkout redesign'").get();
  if (existing) return existing.id;
  const projectId = id();
  const requestId = id();
  const time = now();
  db.prepare('INSERT INTO projects VALUES (?,?,?,?,?,?,?,?)').run(
    projectId, 'Northstar Studio · Checkout redesign', 'Maya Chen',
    process.env.PAYPAL_BUYER_EMAIL || 'maya.buyer@example.com',
    'Statement of work — Northstar Studio checkout redesign\n1. Deliver a responsive desktop checkout for the existing web storefront.\n2. Include PayPal Checkout, order summary, and confirmation page.\n3. Provide two rounds of visual revisions.\n4. Mobile-native app screens and SMS notifications are excluded.\n5. Any additional deliverable requires written approval and a separate fee.',
    85, 'USD', time
  );
  db.prepare('INSERT INTO requests (id,project_id,title,body,source_url,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(
    requestId, projectId, 'Add a native mobile checkout',
    'Could you also design and build native iOS and Android checkout screens, with SMS order updates? It should be included in the current project.',
    null, time, time
  );
  return projectId;
}
