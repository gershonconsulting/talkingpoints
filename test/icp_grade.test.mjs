// node --test test/icp_grade.test.mjs — ICP Match Grade on top of every talking point (2026-11-26).
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeIcpGrade, icpGradeFromBrief, hasIcpGrade, icpChip, normStatus } from '../functions/_icp.js';
import { assemble } from '../functions/_engine.js';
import { renderBrief, renderBriefText } from '../functions/_render.js';
import { briefQuality } from '../functions/_auto.js';

const C = (criterion, status, must = false) => ({ criterion, status, must, evidence: `${criterion} evidence` });

test('all criteria met -> A+, strong match', () => {
  const g = computeIcpGrade([C('Country', 'met', true), C('Size', 'met'), C('Sector', 'met'), C('US need', 'met')]);
  assert.equal(g.letter, 'A+');
  assert.match(g.headline, /^Strong ICP match — 4 of 4 criteria met/);
  assert.equal(g.provisional, false);
});

test('mixed criteria give a middle grade, deterministic', () => {
  const rows = [C('Country', 'met', true), C('Size', 'partial'), C('Sector', 'met'), C('Revenue', 'unknown')];
  const a = computeIcpGrade(rows), b = computeIcpGrade(rows);
  assert.equal(a.letter, b.letter);
  assert.equal(a.score, 69);   // (1 + .5 + 1 + .25) / 4
  assert.equal(a.letter, 'B');
});

test('a missed must-have caps the grade at C−, two give D (e.g. a French lead for Gershon)', () => {
  const one = computeIcpGrade([C('Country outside USA and France', 'missed', true), C('Size', 'met'), C('Sector', 'met'), C('US need', 'met'), C('Revenue', 'met')]);
  assert.equal(one.letter, 'C−');
  assert.match(one.headline, /^Outside the ICP/);
  assert.match(one.detail, /Must-have missed: \*\*Country outside USA and France\*\*/);
  const two = computeIcpGrade([C('Country', 'missed', true), C('Size', 'missed', true), C('Sector', 'met')]);
  assert.equal(two.letter, 'D');
});

test('mostly unverified -> provisional; unknown is never rewarded as a fit', () => {
  const g = computeIcpGrade([C('Country', 'unknown'), C('Size', 'unknown'), C('Sector', 'met')]);
  assert.equal(g.provisional, true);
  assert.ok(['C+', 'C', 'C−', 'D', 'B−'].includes(g.letter));
  assert.equal(icpChip(g).label, `ICP MATCH: ${g.letter}*`);
});

test('status words are normalised', () => {
  assert.equal(normStatus('Met'), 'met');
  assert.equal(normStatus('partly'), 'partial');
  assert.equal(normStatus('not met'), 'missed');
  assert.equal(normStatus('?'), 'unknown');
});

test('older talking points are graded from the verdict they carry', () => {
  const g = icpGradeFromBrief({ snapshot: [{ label: 'ICP fit', value: 'Weak fit — US company, outside the ICP' }] });
  assert.equal(g.letter, 'D');
  assert.equal(g.basis, 'verdict');
  assert.equal(icpGradeFromBrief({ header: { chips: [{ label: 'ICP: STRONG FIT' }] } }).letter, 'A');
  assert.equal(icpGradeFromBrief({}), null);
  assert.ok(hasIcpGrade({ icp_grade: { letter: 'B−' } }));
  assert.ok(hasIcpGrade({ icp_grade: { letter: 'B-*' } }));
  assert.ok(!hasIcpGrade({ icp_grade: { letter: 'n/a' } }));
});

const research = { grade: { letter: 'B', headline: 'h', detail: 'd' }, corpus: 'Acme Robotics builds warehouse robots in Munich with 12 employees', social: [], registry: [], news: [], about: [], person: [], events: [], facts: 3, provider: 'test' };
const lead = { company: 'Acme Robotics', leadName: 'Jo Doe', leadRole: 'CEO', stage: 'Lead' };

test('engine puts the ICP grade first in the header chips and drops unsourced evidence', () => {
  const ai = { icp_fit: { verdict: 'Strong fit', why: 'German robotics firm.', criteria: [
    { criterion: 'Country outside USA/France', must: true, status: 'met', evidence: 'HQ in Munich' },
    { criterion: 'Size 1–19 employees', status: 'met', evidence: 'It has 12 employees' },
    { criterion: 'Revenue > $1M', status: 'met', evidence: 'Revenue of $45 million.' },   // not in the material
  ] } };
  const d = assemble({ ai, research, lead, site: { ok: true, text: '' }, domain: 'acme.de', clientName: 'Gershon', financials: null, corpusAll: research.corpus, how: '', kb: 'ICP: international tech companies', model: 'm' });
  assert.equal(d.header.chips[0].label.startsWith('ICP MATCH: '), true);
  const rev = d.icp_grade.criteria.find((c) => /Revenue/.test(c.criterion));
  assert.equal(rev.status, 'unknown');
  assert.equal(rev.evidence, 'not in the material');
  assert.ok(!d.snapshot.some((r) => /^ICP fit$/.test(r.label)));
});

test('no ICP judgement -> not graded, flagged, and the automatic send is held', () => {
  const d = assemble({ ai: {}, research, lead, site: { ok: true, text: '' }, domain: 'acme.de', clientName: 'Gershon', financials: null, corpusAll: '', how: '', kb: '', model: 'm' });
  assert.equal(d.icp_grade, null);
  assert.equal(d.header.chips[0].label, 'ICP MATCH: NOT GRADED');
  assert.equal(d.attention[0].title, 'ICP match not graded');
  assert.ok(briefQuality({ ...d, auto: true }).missing.includes('ICP match grade'));
});

test('the ICP grade renders right after the header, above the social grade', () => {
  const data = { header: { company: 'Acme' }, icp_grade: computeIcpGrade([C('Country', 'met', true), C('Size', 'missed')]), grade: { letter: 'B', headline: 'x' } };
  const html = renderBrief(data);
  const iIcp = html.indexOf('ICP Match Grade'), iSocial = html.indexOf('Social Network Effectiveness Grade'), iHead = html.indexOf('Acme');
  assert.ok(iHead < iIcp && iIcp < iSocial);
  assert.match(html, /MUST/);
  assert.match(renderBriefText(data), /ICP MATCH GRADE: /);
  assert.match(renderBrief({ header: { company: 'Acme' } }), /ICP Match Grade[\s\S]*Not graded/);
});
