/** PII redaction coverage for text bound for AI processing or the in-memory excerpt. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactPii } from '../src/lib/utils/redactPii';

test('redacts SA ID numbers and card-like digit runs', () => {
  assert.equal(redactPii('ID 7804250341089 here'), 'ID [CONFIDENTIAL_POPIA_REDACTED] here');
  assert.equal(redactPii('card 4111 1111 1111 1111 end'), 'card [CONFIDENTIAL_POPIA_REDACTED] end');
});

test('redacts email addresses', () => {
  assert.equal(redactPii('contact eric@example.co.za please'), 'contact [CONFIDENTIAL_POPIA_REDACTED] please');
});

test('redacts SA phone numbers in local and international form', () => {
  assert.equal(redactPii('call 0821234567 now'), 'call [CONFIDENTIAL_POPIA_REDACTED] now');
  assert.equal(redactPii('call +27 82 123 4567 now'), 'call [CONFIDENTIAL_POPIA_REDACTED] now');
});

test('redacts SA VAT numbers', () => {
  assert.equal(redactPii('VAT 4123456789.'), 'VAT [CONFIDENTIAL_POPIA_REDACTED].');
});

test('keeps tender substance: amounts, dates and references survive', () => {
  const text = 'Bid closes 2026-12-15. Estimated value R1,500,000.00. Reference RT57-2026-ICT. Briefing at 10:00.';
  assert.equal(redactPii(text), text);
});
