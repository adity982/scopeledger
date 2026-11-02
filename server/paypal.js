const base = 'https://api-m.sandbox.paypal.com';
let cachedToken;
let tokenExpiry = 0;

export function paypalConfigured() {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET && process.env.PAYPAL_INVOICER_EMAIL);
}

async function accessToken() {
  if (!paypalConfigured()) throw new Error('PayPal sandbox credentials and invoicer email are required');
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const basic = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const response = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`PayPal authentication failed: ${data.error_description || response.status}`);
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + Math.max(60, data.expires_in - 120) * 1000;
  return cachedToken;
}

async function paypalRequest(method, path, body) {
  const token = await accessToken();
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : {};
  if (!response.ok) throw new Error(`PayPal ${response.status}: ${data.message || data.error || raw.slice(0, 160)}`);
  return data;
}

export async function createDraftInvoice(project, request) {
  const amount = Number(request.amount).toFixed(2);
  const invoice = await paypalRequest('POST', '/v2/invoicing/invoices', {
    detail: { currency_code: project.currency, note: `ScopeLedger change order: ${request.title}`, payment_term: { term_type: 'DUE_ON_RECEIPT' } },
    invoicer: { email_address: process.env.PAYPAL_INVOICER_EMAIL },
    primary_recipients: [{ billing_info: { email_address: project.client_email } }],
    items: [{ name: request.title.slice(0, 200), description: request.work_description.slice(0, 1000), quantity: '1', unit_amount: { currency_code: project.currency, value: amount } }]
  });
  const invoiceId = invoice.id || invoice.href?.match(/INV2-[A-Z0-9-]+/)?.[0] || invoice.links?.find(link => link.rel === 'self')?.href?.match(/INV2-[A-Z0-9-]+/)?.[0];
  if (!invoiceId) throw new Error('PayPal created an invoice but did not return its ID');
  return invoiceId;
}

export async function sendInvoice(invoiceId) {
  await paypalRequest('POST', `/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}/send`, { send_to_recipient: true, send_to_invoicer: false });
  const detail = await getInvoice(invoiceId);
  return { id: invoiceId, url: detail.detail?.metadata?.recipient_view_url || detail.metadata?.recipient_view_url || null, status: detail.status };
}

export async function getInvoice(invoiceId) {
  if (!/^INV2-[A-Z0-9-]+$/.test(invoiceId)) throw new Error('Invalid invoice ID');
  return paypalRequest('GET', `/v2/invoicing/invoices/${invoiceId}`);
}

export async function verifyWebhook(headers, event) {
  if (!process.env.PAYPAL_WEBHOOK_ID) throw new Error('PAYPAL_WEBHOOK_ID is required to verify webhooks');
  const required = ['paypal-transmission-id', 'paypal-transmission-time', 'paypal-cert-url', 'paypal-auth-algo', 'paypal-transmission-sig'];
  if (required.some(key => !headers[key])) return false;
  const result = await paypalRequest('POST', '/v1/notifications/verify-webhook-signature', {
    transmission_id: headers['paypal-transmission-id'],
    transmission_time: headers['paypal-transmission-time'],
    cert_url: headers['paypal-cert-url'],
    auth_algo: headers['paypal-auth-algo'],
    transmission_sig: headers['paypal-transmission-sig'],
    webhook_id: process.env.PAYPAL_WEBHOOK_ID,
    webhook_event: event
  });
  return result.verification_status === 'SUCCESS';
}

export function paidStatus(status) {
  // MARKED_AS_PAID can be entered manually outside PayPal; it is not proof of a sandbox payment.
  return status === 'PAID';
}
