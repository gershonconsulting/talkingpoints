// node --test test/same_day_window.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { sendWindowOpen, SAME_DAY_HOUR } from '../functions/_weekly.js';

test('weekdays: send window opens at 4 pm New York time', () => {
  assert.equal(SAME_DAY_HOUR, 16);
  assert.equal(sendWindowOpen({ weekday: 'Thu', hour: 15 }), false);
  assert.equal(sendWindowOpen({ weekday: 'Thu', hour: 16 }), true);
  assert.equal(sendWindowOpen({ weekday: 'Mon', hour: 23 }), true);
  assert.equal(sendWindowOpen({ weekday: 'Sat', hour: 9 }), false);
});
test('Fridays keep the all-day window from 7 am', () => {
  assert.equal(sendWindowOpen({ weekday: 'Fri', hour: 6 }), false);
  assert.equal(sendWindowOpen({ weekday: 'Fri', hour: 7 }), true);
});

// Safety defaults (review of PR #32, 2026-11-20).
import { NO_WEEKEND_SENDS, FIRST_RUN_LOOKBACK_HOURS, NEW_LEAD_DAYS, sameDayCutoff, sameDayStart, sameDayEligible } from '../functions/_weekly.js';

test('no same-day sends on Saturday or Sunday (New York time)', () => {
  assert.equal(NO_WEEKEND_SENDS, true);
  for (const weekday of ['Sat', 'Sun']) for (const hour of [7, 9, 16, 18, 23]) assert.equal(sendWindowOpen({ weekday, hour }), false, `${weekday} ${hour}h`);
  assert.equal(sendWindowOpen({ weekday: 'Mon', hour: 16 }), true);
});

const H = 3600e3, D = 24 * H;
function fakeEnv() {
  const secrets = new Map();
  return { secrets, DB: { prepare: (sql) => ({ bind: (...a) => ({
    async run() { if (/INSERT OR IGNORE/.test(sql) && !secrets.has(a[0])) secrets.set(a[0], a[1]); return { meta: {} }; },
    async first() { return secrets.has(a[0]) ? { value: secrets.get(a[0]) } : null; },
  }) }) } };
}

test('first run only considers leads created in the last 24h (no 14-day backlog)', async () => {
  assert.equal(FIRST_RUN_LOOKBACK_HOURS, 24);
  const env = fakeEnv(); const now = Date.UTC(2026, 10, 23, 21);
  const start = await sameDayStart(env, now);
  assert.equal(start, now);
  const cutoff = sameDayCutoff(start, now);
  assert.equal(cutoff, now - 24 * H);
  const backlog = [1, 3, 7, 13].map((d) => ({ creationTimestamp: now - d * D - H }));
  assert.equal(backlog.filter((b) => sameDayEligible(b, cutoff)).length, 0);
  assert.equal(sameDayEligible({ creationTimestamp: now - 2 * H }, cutoff), true);
  // Gershon "Scheduled" pipelines: an old lead counts only if it entered the stage after the cutoff.
  assert.equal(sameDayEligible({ creationTimestamp: now - 10 * D, lastStageChangeTimestamp: now - 5 * D }, cutoff, { scheduled: true }), false);
  assert.equal(sameDayEligible({ creationTimestamp: now - 10 * D, lastStageChangeTimestamp: now - H }, cutoff, { scheduled: true }), true);
});

test('later runs keep the first-run start (leads since then still go, older backlog never)', async () => {
  const env = fakeEnv(); const t0 = Date.UTC(2026, 10, 23, 21);
  await sameDayStart(env, t0);
  const later = t0 + 3 * D;
  const start = await sameDayStart(env, later);           // stored value wins
  assert.equal(start, t0);
  const cutoff = sameDayCutoff(start, later);
  assert.equal(cutoff, t0 - 24 * H);
  assert.equal(sameDayEligible({ creationTimestamp: t0 + D }, cutoff), true);     // weekend lead, sent Monday
  assert.equal(sameDayEligible({ creationTimestamp: t0 - 2 * D }, cutoff), false); // pre-start backlog
  // Long after the start the normal 14-day window applies again.
  const muchLater = t0 + 40 * D;
  assert.equal(sameDayCutoff(start, muchLater), muchLater - NEW_LEAD_DAYS * D);
});
