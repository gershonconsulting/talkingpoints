// node --test test/format_and_website.test.mjs — 2026-11-23 engine fix (AbelZeta brief off-format)
import test from 'node:test';
import assert from 'node:assert/strict';
import { briefQuality, websiteCandidates, companySlugs, siteNamesCompany } from '../functions/_auto.js';
import { renderBrief } from '../functions/_render.js';
import { applyTemplate } from '../functions/_template.js';

const ABELZETA = {
  auto: true, site_read: false,
  header: { company: 'AbelZeta', role: 'Executive Director, R&D', chips: [{ label: 'LEAD' }, { label: 'ICP: UNKNOWN' }] },
  snapshot: [{ label: 'Website', value: 'AbelZeta' }],
  lead_with: [{ title: 'a' }, { title: 'b' }, { title: 'c' }], talking_points: [1, 2, 3, 4, 5, 6],
  company: { text: 'unknown' }, hooks: ['h'], person: { name: 'Shigui Zhu', text: 'Executive Director, R&D' },
};

test('the AbelZeta skeleton now fails the quality check', () => {
  const q = briefQuality(ABELZETA);
  assert.equal(q.ok, false);
  assert.ok(q.missing.includes("the lead company's website"));
  assert.ok(q.missing.includes('ICP match grade'));
  assert.ok(q.missing.some((m) => /person/.test(m)));
});

test('a full AI brief still passes', () => {
  const q = briefQuality({ ...ABELZETA, site_read: true, header: { ...ABELZETA.header, chips: [{ label: 'ICP MATCH: A' }] }, icp_grade: { letter: 'A', headline: 'Strong ICP match' },
    person: { name: 'Shigui Zhu', text: 'Leads R&D for cell therapy programmes at AbelZeta; previously at a CAR-T developer in Shanghai.' } });
  assert.deepEqual(q, { ok: true, missing: [] });
});

test('researched briefs are not judged on the AI-only rules', () => {
  assert.equal(briefQuality({ lead_with: [1, 2, 3], talking_points: [1, 2, 3, 4, 5], company: { text: 'c' }, snapshot: [{}], hooks: ['h'] }).ok, true);
});

test('website candidates: personal mail and the client\'s own domain are skipped, the company name is guessed', () => {
  const c = websiteCandidates({ company: 'AbelZeta', leadEmail: 'shigui@gmail.com',
    conversation: 'Amos: wrote from amos.lee@meteorbiotech.com, see https://www.linkedin.com/in/x', emails: [] }, ['meteorbiotech.com']);
  assert.deepEqual(c.map((x) => x.target.domain), ['abelzeta.com']);
  assert.equal(c[0].target.guessed, true);
});

test('website candidates: Streak field and work email come before the guess', () => {
  const c = websiteCandidates({ company: 'Acme Bio', website: 'https://acmebio.org', leadEmail: 'jo@acme-bio.com' });
  assert.deepEqual(c.map((x) => x.target.domain), ['acmebio.org', 'acme-bio.com', 'acmebio.com', 'acme.com']);
});

test('company slugs drop legal suffixes and Streak box suffixes', () => {
  assert.deepEqual(companySlugs('Meteor Biotech Inc.'), ['meteorbiotech', 'meteor-biotech', 'meteor']);
  assert.deepEqual(companySlugs('EarthFrame - Phileal'), ['earthframe']);
});

test('a guessed site must name the company', () => {
  assert.equal(siteNamesCompany({ name: 'AbelZeta', text: 'AbelZeta Pharma — cell therapy' }, 'AbelZeta'), true);
  assert.equal(siteNamesCompany({ name: 'Domain for sale', text: 'buy this domain' }, 'AbelZeta'), false);
});

test('every section of the format is shown, with "not found" lines when empty', () => {
  const html = renderBrief({ header: { company: 'X' } });
  for (const t of ['Social Network Effectiveness Grade', 'The person', 'The company', 'Financials &amp; ownership', 'Network in common',
    'What they posted recently', 'LinkedIn groups', 'Events they attended or spoke at', 'LinkedIn &amp; social intelligence', 'Next important US events']) {
    assert.ok(html.toUpperCase().includes(t.toUpperCase()), t);
  }
});

test('a section switched off in Settings stays off', () => {
  const html = renderBrief(applyTemplate({ header: { company: 'X' } }, { disabled: ['groups'] }));
  assert.ok(!html.toUpperCase().includes('LINKEDIN GROUPS'));
});

test('renderBrief does not change the brief it is given', () => {
  const d = { header: { company: 'X' } };
  renderBrief(d);
  assert.deepEqual(d, { header: { company: 'X' } });
});
