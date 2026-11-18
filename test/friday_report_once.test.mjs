// node --test test/friday_report_once.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { maybeSendFridayReport, sendReportOnce } from '../functions/_friday_report.js';

// Minimal in-memory D1 for app_secrets + the report queries.
function fakeEnv() {
  const secrets = new Map();
  const stmt = (sql) => ({
    bind: (...a) => ({
      async run() {
        if (/INSERT OR IGNORE INTO app_secrets/.test(sql)) { if (secrets.has(a[0])) return { meta: { changes: 0 } }; secrets.set(a[0], a[1]); return { meta: { changes: 1 } }; }
        if (/DELETE FROM app_secrets/.test(sql)) { secrets.delete(a[0]); return { meta: { changes: 1 } }; }
        if (/INSERT INTO app_secrets/.test(sql)) { secrets.set(a[0], a[1]); return { meta: { changes: 1 } }; }
        return { meta: { changes: 0 } };
      },
      async first() { return secrets.has(a[0]) ? { value: secrets.get(a[0]) } : null; },
      async all() { return { results: [] }; },
    }),
    async all() { return { results: [] }; },
  });
  return { secrets, DB: { prepare: stmt } };
}
const rep = { subject: 's', html: 'h', text: 't', total: 0 };

test('same date: second and concurrent calls do not send', async () => {
  const env = fakeEnv(); const sent = [];
  const send = async (_e, m) => { sent.push(m); };
  const r = await Promise.all([sendReportOnce(env, '2026-11-13', rep, send), sendReportOnce(env, '2026-11-13', rep, send)]);
  assert.deepEqual(r.sort(), [false, true]);
  assert.equal(await sendReportOnce(env, '2026-11-13', rep, send), false);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].idempotencyKey, 'tp-report-2026-11-13');
  assert.deepEqual(sent[0].to, ['report@gershonconsulting.com']);
});

test('different date still sends', async () => {
  const env = fakeEnv(); let n = 0; const send = async () => { n++; };
  await sendReportOnce(env, '2026-11-13', rep, send); await sendReportOnce(env, '2026-11-20', rep, send);
  assert.equal(n, 2);
});

test('failed send releases the claim so the next run retries', async () => {
  const env = fakeEnv(); let n = 0;
  await assert.rejects(sendReportOnce(env, '2026-11-13', rep, async () => { throw new Error('boom'); }));
  assert.equal(await sendReportOnce(env, '2026-11-13', rep, async () => { n++; }), true);
  assert.equal(n, 1);
});

test('Friday 6 PM then Saturday fallback: one email total', async () => {
  const env = fakeEnv(); let n = 0; const send = async () => { n++; };
  await maybeSendFridayReport(env, [], { send, now: { day: '2026-11-13', hour: 18, weekday: 'Fri' } });
  await maybeSendFridayReport(env, [], { send, now: { day: '2026-11-13', hour: 22, weekday: 'Fri' } });
  await maybeSendFridayReport(env, [], { send, now: { day: '2026-11-14', hour: 1, weekday: 'Sat' } });
  await maybeSendFridayReport(env, [], { send, now: { day: '2026-11-14', hour: 9, weekday: 'Sat' } });
  assert.equal(n, 1);
});

test('lost marker (WEEKLY_REPORT wiped) still cannot double send', async () => {
  const env = fakeEnv(); let n = 0; const send = async () => { n++; };
  await maybeSendFridayReport(env, [], { send, now: { day: '2026-11-13', hour: 19, weekday: 'Fri' } });
  env.secrets.delete('WEEKLY_REPORT');
  await maybeSendFridayReport(env, [], { send, now: { day: '2026-11-14', hour: 9, weekday: 'Sat' } });
  assert.equal(n, 1);
});
