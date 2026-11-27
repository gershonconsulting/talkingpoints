// node --test test/internal_sender.test.mjs
// v1.17.2 (nightly 2026-11-27): GC sender name on internal-only emails; client emails untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { internalSender, isGershonAddress, sendEmail } from '../functions/_lib.js';
import { planBriefEmail, FROM_INTERNAL, FROM_CLIENT } from '../functions/_audience.js';

const OLD = 'Gershon Talking Points <talkingpoints@gershon.ai>';
const GC = 'GC Talking Points <talkingpoints@gershon.ai>';

test('internal-only recipients -> "GC Talking Points", address kept', () => {
  assert.equal(internalSender(OLD, ['report@gershonconsulting.com']), GC);
  assert.equal(internalSender(OLD, 'olivier@gershonconsulting.com, sales@gershonconsulting.com'), GC);
  assert.equal(internalSender(OLD, ['Report <report@gershonconsulting.com>', 'x@gershon.ai', 'oattia@gmail.com']), GC);
  assert.equal(internalSender('"Talking Points" <talkingpoints@gershon.ai>', ['olivier@gershonconsulting.com']), GC);
});

test('any external recipient (To, Cc or Bcc) -> sender unchanged', () => {
  assert.equal(internalSender(OLD, ['anne@client-a.example']), OLD);
  assert.equal(internalSender(OLD, ['report@gershonconsulting.com', 'julien@client-a.example']), OLD);
  assert.equal(internalSender(OLD, ['report@gershonconsulting.com'], ['ceo@client-b.example']), OLD);
  assert.equal(internalSender(OLD, ['report@gershonconsulting.com'], [], ['ceo@client-b.example']), OLD);
  assert.equal(internalSender(OLD, []), OLD);
  assert.equal(internalSender(OLD, undefined), OLD);
});

test('client brand and already-GC senders are never renamed', () => {
  assert.equal(internalSender(FROM_CLIENT, ['olivier@gershonconsulting.com']), FROM_CLIENT);
  assert.equal(internalSender(FROM_CLIENT, ['anne@client-a.example']), FROM_CLIENT);
  assert.equal(internalSender(GC, ['report@gershonconsulting.com']), GC);
});

test('look-alike domains are not internal', () => {
  assert.equal(isGershonAddress('x@gershonconsulting.com.evil.io'), false);
  assert.equal(isGershonAddress('x@notgershon.ai'), false);
  assert.equal(isGershonAddress('oattia@gmail.com.evil.io'), false);
  assert.equal(internalSender(OLD, ['x@notgershon.ai']), OLD);
});

test('brief plan: client-bound sender unchanged, internal = GC', () => {
  assert.equal(planBriefEmail(['anne@client-a.example', 'olivier@gershonconsulting.com'], {}).from, FROM_CLIENT);
  assert.equal(planBriefEmail(['olivier@gershonconsulting.com'], {}).from, FROM_INTERNAL);
  assert.equal(FROM_INTERNAL, GC);
  assert.equal(FROM_CLIENT, 'Gershon Consulting <talkingpoints@gershon.ai>');
});

test('sendEmail Resend payload: client-bound byte-identical, internal gets GC', async () => {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url, body: init.body }); return { ok: true, json: async () => ({ id: 'x' }) }; };
  try {
    const env = { RESEND_API_KEY: 'k' };
    const client = { to: ['anne@client-a.example'], subject: 's', html: 'h', text: 't', from: OLD };
    await sendEmail(env, client);
    assert.equal(calls[0].body, JSON.stringify({ from: OLD, reply_to: 'olivier@gershonconsulting.com', to: client.to, subject: 's', html: 'h', text: 't' }));
    await sendEmail(env, { ...client, from: FROM_CLIENT });
    assert.equal(JSON.parse(calls[1].body).from, FROM_CLIENT);
    await sendEmail(env, { ...client, to: ['report@gershonconsulting.com'] });
    assert.equal(JSON.parse(calls[2].body).from, GC);
    await sendEmail(env, { to: ['julien@client-a.example'], subject: 's', html: 'h', text: 't' });
    assert.equal(JSON.parse(calls[3].body).from, FROM_CLIENT);
  } finally { globalThis.fetch = orig; }
});
