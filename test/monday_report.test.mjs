// node --test test/monday_report.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAudience, gradeFromChannels, gradeSocial, gradeFromBrief, hasGrade } from '../functions/_grade.js';
import { maybeSendMondayReport, buildMondayReport, ensureGrades } from '../functions/_monday_report.js';

test('parseAudience reads follower counts', () => {
  assert.equal(parseAudience('Acme | 12,345 followers on LinkedIn'), 12345);
  assert.equal(parseAudience('1.2K followers'), 1200);
  assert.equal(parseAudience('3M subscribers'), 3000000);
  assert.equal(parseAudience('— followers'), null);
  assert.equal(parseAudience('no numbers here'), null);
});

test('grade scale', () => {
  assert.equal(gradeFromChannels([]).letter, 'D');
  assert.equal(gradeFromChannels([{ channel: 'LinkedIn' }]).letter, 'C-');
  assert.equal(gradeFromChannels([{ channel: 'LinkedIn' }, { channel: 'X' }, { channel: 'YouTube' }, { channel: 'Facebook' }]).letter, 'C+');
  assert.equal(gradeFromChannels([{ channel: 'LinkedIn', audience: 4000 }]).letter, 'B');
  assert.equal(gradeFromChannels([{ channel: 'LinkedIn', audience: 12000 }]).letter, 'B+');
  assert.equal(gradeFromChannels([{ channel: 'LinkedIn', audience: 80000 }, { channel: 'X', audience: 30000 }, { channel: 'YouTube', audience: 5000 }]).letter, 'A+');
  assert.ok(hasGrade({ grade: gradeFromChannels([]) }));
  assert.ok(hasGrade({ grade: { letter: 'B−' } }), 'unicode minus accepted');
  assert.ok(!hasGrade({}));
});

test('gradeSocial uses fetched audiences', async () => {
  const g = await gradeSocial([{ channel: 'LinkedIn', url: 'u1' }, { channel: 'X', url: 'u2' }], { fetchFn: async (u) => (u === 'u1' ? 15000 : null) });
  assert.equal(g.letter, 'B+');
  assert.match(g.detail, /LinkedIn \(15K\)/);
});

test('gradeFromBrief from a saved social table', () => {
  assert.equal(gradeFromBrief({ social: { rows: [{ channel: 'LinkedIn', audience: '2,500' }] } }).letter, 'B-');
  assert.equal(gradeFromBrief({}).letter, 'D');
});

// In-memory D1 for clients, briefs, app_secrets.
function fakeEnv({ clients = [], briefs = [] } = {}) {
  const secrets = new Map();
  const prepare = (sql) => {
    const exec = (a = []) => ({
      async run() {
        if (/INSERT OR IGNORE INTO app_secrets/.test(sql)) { if (secrets.has(a[0])) return { meta: { changes: 0 } }; secrets.set(a[0], a[1]); return { meta: { changes: 1 } }; }
        if (/DELETE FROM app_secrets/.test(sql)) { secrets.delete(a[0]); return { meta: { changes: 1 } }; }
        if (/UPDATE briefs SET data/.test(sql)) { briefs.find((b) => b.id === a[1]).data = a[0]; return { meta: { changes: 1 } }; }
        return { meta: { changes: 0 } };
      },
      async first() { return secrets.has(a[0]) ? { value: secrets.get(a[0]) } : null; },
      async all() {
        if (/FROM clients/.test(sql)) return { results: clients };
        if (/GROUP BY client_id/.test(sql)) { const m = {}; for (const b of briefs) m[b.client_id] = (m[b.client_id] || 0) + 1; return { results: Object.entries(m).map(([k, n]) => ({ client_id: +k, n })) }; }
        if (/WHERE created_at >= \?/.test(sql)) return { results: briefs.filter((b) => b.created_at >= a[0] && b.created_at < a[1]) };
        if (/SELECT id, data FROM briefs/.test(sql)) return { results: briefs };
        return { results: [] };
      },
    });
    return { bind: (...a) => exec(a), ...exec() };
  };
  return { secrets, briefs, DB: { prepare } };
}

const data = (grade) => JSON.stringify({ header: { company: 'X' }, ...(grade ? { grade: { letter: grade } } : {}) });

test('report counts last week per client, fills missing grades', async () => {
  const env = fakeEnv({
    clients: [{ id: 1, name: 'Valos' }, { id: 2, name: 'Meteor Biotech' }],
    briefs: [
      { id: 1, client_id: 1, company: 'Electra', lead_name: 'A', data: data('C+'), created_at: '2026-11-24 15:00:00' },
      { id: 2, client_id: 1, company: 'Hybernia', lead_name: 'B', data: data(null), created_at: '2026-11-26 15:00:00' },
      { id: 3, client_id: 2, company: 'Psomagen', lead_name: 'C', data: data('B'), created_at: '2026-11-29 20:00:00' },
      { id: 4, client_id: 2, company: 'Old', lead_name: 'D', data: data('A'), created_at: '2026-11-10 15:00:00' },
      { id: 5, client_id: 2, company: 'Next week', lead_name: 'E', data: data('A'), created_at: '2026-12-01 15:00:00' },
    ],
  });
  assert.equal(await ensureGrades(env), 1);
  const rep = await buildMondayReport(env, '2026-11-30');
  assert.equal(rep.total, 3);
  assert.equal(rep.ungraded, 0);
  assert.deepEqual(rep.week, ['2026-11-23', '2026-11-29']);
  assert.equal(rep.clients.find((c) => c.name === 'Valos').count, 2);
  assert.equal(rep.clients.find((c) => c.name === 'Meteor Biotech').total, 3);
  assert.match(rep.subject, /Nov 23 – Nov 29, 2026 \(Monday report\)/);
  assert.match(rep.html, /3\/3<\/b> graded/);
});

test('Monday 8 AM then Tuesday fallback: one email only', async () => {
  const env = fakeEnv(); let n = 0; const send = async (_e, m) => { n++; assert.equal(m.idempotencyKey, 'tp-monday-2026-11-30'); };
  assert.equal(await maybeSendMondayReport(env, { send, now: { day: '2026-11-30', hour: 7, weekday: 'Mon' } }), null);
  await maybeSendMondayReport(env, { send, now: { day: '2026-11-30', hour: 8, weekday: 'Mon' } });
  await maybeSendMondayReport(env, { send, now: { day: '2026-11-30', hour: 9, weekday: 'Mon' } });
  await maybeSendMondayReport(env, { send, now: { day: '2026-12-01', hour: 9, weekday: 'Tue' } });
  assert.equal(n, 1);
  assert.equal(await maybeSendMondayReport(env, { send, now: { day: '2026-12-02', hour: 9, weekday: 'Wed' } }), null);
});

test('failed send releases the claim', async () => {
  const env = fakeEnv();
  await assert.rejects(maybeSendMondayReport(env, { send: async () => { throw new Error('boom'); }, now: { day: '2026-11-30', hour: 8, weekday: 'Mon' } }));
  let n = 0; await maybeSendMondayReport(env, { send: async () => { n++; }, now: { day: '2026-11-30', hour: 9, weekday: 'Mon' } });
  assert.equal(n, 1);
});
