// node --test test/website_identity.test.mjs — v1.16.1 (Kingdee International Holdings brief, 2026-11-24)
import test from 'node:test';
import assert from 'node:assert/strict';
import { distinctiveWords, namesCompany, pickOfficialSite, searchOfficialSite, identityCheck } from '../functions/_website.js';

test('distinctive words drop legal and generic words', () => {
  assert.deepEqual(distinctiveWords('Kingdee International Holdings'), ['kingdee']);
  assert.deepEqual(distinctiveWords('Meteor Biotech Inc.'), ['meteor', 'biotech']);
});

test('kingdee.com is accepted for "Kingdee International Holdings"', () => {
  assert.equal(namesCompany({ name: 'Kingdee', text: '金蝶 Kingdee — cloud ERP for enterprises' }, 'Kingdee International Holdings', 'kingdee.com'), true);
});

test('a parked or unrelated domain is still rejected', () => {
  assert.equal(namesCompany({ name: 'Domain for sale', text: 'buy this domain' }, 'Kingdee International Holdings', 'kingdee-international.com'), false);
  assert.equal(namesCompany({ name: 'AbelZeta', text: 'AbelZeta Pharma' }, 'AbelZeta', 'abelzeta.com'), true);
});

test('search results: directories skipped, the company site picked', () => {
  const r = [
    { url: 'https://www.linkedin.com/company/kingdee' },
    { url: 'https://en.wikipedia.org/wiki/Kingdee_International_Software_Group' },
    { url: 'https://www.hkexnews.hk/x' },
    { url: 'https://www.kingdee.com/en/about' },
  ];
  assert.deepEqual(pickOfficialSite(r, 'Kingdee International Holdings'), { kind: 'website', domain: 'kingdee.com', url: 'https://www.kingdee.com', searched: true });
  assert.equal(pickOfficialSite([{ url: 'https://www.linkedin.com/company/kingdee' }], 'Kingdee International Holdings'), null);
});

test('searchOfficialSite uses the injected search and tries a second query', async () => {
  const qs = [];
  const search = async (q) => { qs.push(q); return qs.length === 1 ? [] : [{ url: 'https://kingdee.com/' }]; };
  const t = await searchOfficialSite(search, 'Kingdee International Holdings');
  assert.equal(t.domain, 'kingdee.com');
  assert.equal(qs.length, 2);
});

test('personal mailbox + nothing public = identity flag', () => {
  const a = identityCheck({ leadName: 'Yusen Zhao', company: 'Kingdee International Holdings', freeMail: true, personResults: [], phone: '13728859929' });
  assert.match(a.title, /Not verified/);
  assert.match(a.text, /Kingdee/);
});

test('no flag when a public source ties the person to the company, or with a work email', () => {
  assert.equal(identityCheck({ leadName: 'Yusen Zhao', company: 'Kingdee International Holdings', freeMail: true,
    personResults: [{ title: 'Yusen Zhao - Kingdee | LinkedIn', snippet: 'Overseas business at Kingdee' }] }), null);
  assert.equal(identityCheck({ leadName: 'Yusen Zhao', company: 'Kingdee', freeMail: false }), null);
});
