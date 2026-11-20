// node --test test/brief_quality.test.mjs — quality check for AI talking points (2026-11-20)
import test from 'node:test';
import assert from 'node:assert/strict';
import { briefQuality } from '../functions/_auto.js';

test('a light brief fails and lists what is missing', () => {
  const q = briefQuality({ lead_with: [{ title: 'a' }], talking_points: ['x'], company: { text: 'c' }, snapshot: [{}], hooks: [] });
  assert.equal(q.ok, false);
  assert.ok(q.missing.some((m) => /lead with/.test(m)));
  assert.ok(q.missing.some((m) => /talking points/.test(m)));
  assert.ok(q.missing.some((m) => /worth using/.test(m)));
});

test('a complete brief passes', () => {
  const q = briefQuality({ lead_with: [1, 2, 3], talking_points: [1, 2, 3, 4, 5, 6], company: { text: 'c' }, snapshot: [{}], hooks: ['h'] });
  assert.deepEqual(q, { ok: true, missing: [] });
});
