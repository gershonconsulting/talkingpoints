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
