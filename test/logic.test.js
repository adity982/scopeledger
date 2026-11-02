import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAnalysis, sampleAnalysis } from '../server/analysis.js';
import { paidStatus } from '../server/paypal.js';

const scope = 'Build a desktop checkout. Native mobile apps are excluded.';
const request = 'Please add a native iOS checkout screen.';
const valid = { verdict: 'extra_work', summary: 'New mobile work', scope_quote: 'Native mobile apps are excluded.', request_quote: 'native iOS checkout screen', reason: 'The scope excludes native apps.', suggested_deliverable: 'Build an iOS checkout screen.', suggested_hours: 8 };

test('AI citations must appear verbatim in their source', () => {
  assert.equal(validateAnalysis(valid, scope, request).verdict, 'extra_work');
  assert.throws(() => validateAnalysis({ ...valid, scope_quote: 'No mobile apps allowed' }, scope, request), /citation/);
  assert.throws(() => validateAnalysis({ ...valid, request_quote: 'Android app' }, scope, request), /citation/);
});

test('local sample makes no AI classification claim', () => {
  const sample = sampleAnalysis(scope, request);
  assert.equal(sample.mode, 'sample');
  assert.equal(sample.verdict, 'uncertain');
  assert.equal(sample.suggested_hours, 0);
});

test('only fully paid PayPal invoices are treated as paid', () => {
  for (const status of ['DRAFT','UNPAID','PARTIALLY_PAID','PAYMENT_PENDING','MARKED_AS_PAID','CANCELLED']) assert.equal(paidStatus(status), false);
  assert.equal(paidStatus('PAID'), true);
});
