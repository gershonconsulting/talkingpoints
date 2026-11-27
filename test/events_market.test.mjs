// node --test test/events_market.test.mjs — events follow the client's market (Altavia / Kawartha Dairy, 2026-11-26)
import test from 'node:test';
import assert from 'node:assert/strict';
import { targetMarket } from '../functions/_research.js';
import { prompt } from '../functions/_engine.js';
import { briefQuality } from '../functions/_auto.js';
import { renderBrief, renderBriefText } from '../functions/_render.js';

const ALTAVIA_ICP = 'Geography: Canada focus (must). CPG / food & beverage brands selling through Canadian retail.';
const GERSHON_ICP = 'European companies entering the US market; US expansion within 12 months.';

test('Canadian ICP -> Canada market, US-entry ICP -> US, empty -> US', () => {
  assert.equal(targetMarket(ALTAVIA_ICP).name, 'Canada');
  assert.equal(targetMarket(GERSHON_ICP).name, 'US');
  assert.equal(targetMarket('').name, 'US');
});

test('prompt asks for events in the client market, not the US', () => {
  const p = prompt({ clientName: 'Altavia', company: '', icp: ALTAVIA_ICP, team: [], lead: { company: 'Kawartha Dairy Ltd', leadName: 'Lou Russo' }, site: { ok: false }, research: { corpus: '', market: 'Canada' }, financialsText: '', domain: '' });
  assert.match(p, /events IN Canada/);
  assert.match(p, /CANADA EVENTS SEARCH/);
  assert.doesNotMatch(p, /IFT FIRST/);
  const us = prompt({ clientName: 'Gershon', company: '', icp: GERSHON_ICP, team: [], lead: { company: 'X' }, site: { ok: false }, research: { corpus: '', market: 'US' }, financialsText: '', domain: '' });
  assert.match(us, /events IN the US/);
});

test('render and quality label use the market', () => {
  const d = { events_market: 'Canada', events: [{ name: 'SIAL Canada', when_where: 'May, Montréal' }], engine: 'research-v2', auto: true };
  assert.match(renderBrief(d), /Next important Canada events/);
  assert.match(renderBriefText(d), /NEXT IMPORTANT CANADA EVENTS/);
  assert.ok(briefQuality({ ...d, events: [] }).missing.includes('next Canada events (2+)'));
  assert.match(renderBrief({ events: [{ name: 'IFT FIRST' }] }), /Next important US events/);
});
