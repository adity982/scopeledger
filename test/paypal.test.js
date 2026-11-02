import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftInvoice, sendInvoice, verifyWebhook } from '../server/paypal.js';

test('PayPal adapter creates a sandbox invoice, sends it, and verifies webhook signatures', async () => {
  const originalFetch = globalThis.fetch;
  const saved = Object.fromEntries(['PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET','PAYPAL_INVOICER_EMAIL','PAYPAL_WEBHOOK_ID'].map(key => [key, process.env[key]]));
  Object.assign(process.env, { PAYPAL_CLIENT_ID: 'sandbox-id', PAYPAL_CLIENT_SECRET: 'sandbox-secret', PAYPAL_INVOICER_EMAIL: 'merchant@example.test', PAYPAL_WEBHOOK_ID: 'WH-TEST' });
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/v1/oauth2/token')) return Response.json({ access_token: 'fake-token', expires_in: 3600 });
    if (url.endsWith('/v2/invoicing/invoices') && options.method === 'POST') return Response.json({ id: 'INV2-TEST-123' }, { status: 201 });
    if (url.endsWith('/INV2-TEST-123/send')) return Response.json({});
    if (url.endsWith('/INV2-TEST-123')) return Response.json({ status: 'UNPAID', metadata: { recipient_view_url: 'https://www.sandbox.paypal.com/invoice/view/TEST' } });
    if (url.endsWith('/verify-webhook-signature')) return Response.json({ verification_status: 'SUCCESS' });
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const project = { currency: 'USD', client_email: 'buyer@example.test' };
    const request = { title: 'Add checkout screens', work_description: 'Build native checkout screens', amount: 1020 };
    const id = await createDraftInvoice(project, request);
    assert.equal(id, 'INV2-TEST-123');
    const payload = JSON.parse(calls.find(call => call.url.endsWith('/v2/invoicing/invoices')).options.body);
    assert.equal(payload.invoicer.email_address, 'merchant@example.test');
    assert.equal(payload.primary_recipients[0].billing_info.email_address, 'buyer@example.test');
    assert.equal(payload.items[0].unit_amount.value, '1020.00');
    assert.ok(calls.every(call => call.url.startsWith('https://api-m.sandbox.paypal.com/')));
    const sent = await sendInvoice(id);
    assert.equal(sent.status, 'UNPAID');
    assert.match(sent.url, /sandbox\.paypal\.com/);
    const headers = { 'paypal-transmission-id': 'T', 'paypal-transmission-time': '2026-11-01T00:00:00Z', 'paypal-cert-url': 'https://example.test/cert', 'paypal-auth-algo': 'SHA256withRSA', 'paypal-transmission-sig': 'signature' };
    assert.equal(await verifyWebhook(headers, { id: 'WH-EVENT' }), true);
    assert.equal(JSON.parse(calls.at(-1).options.body).webhook_id, 'WH-TEST');
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
