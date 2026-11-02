import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

test('project to client approval works and never invents a PayPal payment', { timeout: 30000 }, async () => {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const base = `http://127.0.0.1:${port}`;
  const token = 'test-admin-token';
  const server = spawn(process.execPath, ['server/index.js'], {
    cwd: resolve('.'),
    env: { ...process.env, NODE_ENV: 'production', PORT: String(port), ADMIN_TOKEN: token,
      DEMO_MODE: 'true', DATABASE_PATH: resolve('../../work', `scopeledger-test-${randomUUID()}.sqlite`),
      OPENAI_API_KEY: '', PAYPAL_CLIENT_ID: '', PAYPAL_CLIENT_SECRET: '', PAYPAL_INVOICER_EMAIL: '' },
    stdio: 'pipe'
  });
  let output = '';
  server.stdout.on('data', chunk => { output += chunk; });
  server.stderr.on('data', chunk => { output += chunk; });
  try {
    let ready = false;
    for (let i = 0; i < 70; i++) {
      if (server.exitCode !== null) throw new Error(`Server exited: ${output}`);
      try { const r = await fetch(`${base}/api/config`); if (r.ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, `Server did not start: ${output}`);
    const call = async (path, method = 'GET', body, auth = true) => {
      const response = await fetch(`${base}/api${path}`, { method, headers: { ...(auth ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, data: await response.json() };
    };
    assert.equal((await call('/projects', 'GET', undefined, false)).status, 401);
    const seeded = await call('/sample', 'POST');
    assert.equal(seeded.status, 200);
    const project = (await call(`/projects/${seeded.data.id}`)).data;
    assert.equal(project.requests.length, 1);
    const requestId = project.requests[0].id;
    const analysis = await call(`/requests/${requestId}/analyze`, 'POST');
    assert.equal(analysis.data.analysis.mode, 'sample');
    assert.equal(analysis.data.analysis.verdict, 'uncertain');
    const saved = await call(`/requests/${requestId}`, 'PATCH', { work_description: 'Build a native iOS checkout screen.', hours: 8 });
    assert.equal(saved.data.amount, 680);
    const proposed = await call(`/requests/${requestId}/propose`, 'POST');
    assert.equal(proposed.data.status, 'proposed');
    const clientToken = proposed.data.client_token;
    const clientPage = await call(`/client/${clientToken}`, 'GET', undefined, false);
    assert.equal(clientPage.data.amount, 680);
    assert.equal(clientPage.data.project_name, project.name);
    const accepted = await call(`/client/${clientToken}/accept`, 'POST', { name: 'Maya Chen', accepted: true }, false);
    assert.equal(accepted.status, 200);
    const invoice = await call(`/requests/${requestId}/invoice`, 'POST');
    assert.equal(invoice.status, 503);
    const final = await call(`/requests/${requestId}`);
    assert.equal(final.data.status, 'accepted');
    assert.equal(final.data.invoice_id, null);
  } finally {
    server.kill();
  }
});
