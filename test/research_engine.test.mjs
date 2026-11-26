// node --test test/research_engine.test.mjs — v1.16.0 research engine (Phytokana fix, 2026-11-26)
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDuckDuckGo, parseBing, followersIn, parseCount, computeGrade, verifyNumbers, GRADES } from '../functions/_research.js';
import { textOf, firstJson, prospectSpecific, assemble } from '../functions/_engine.js';
import { briefQuality } from '../functions/_auto.js';
import { renderBrief } from '../functions/_render.js';

test('DuckDuckGo HTML results are parsed, ads skipped, redirect unwrapped', () => {
  const html = `<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fphytokana.com%2F&amp;rut=x">Phytokana &amp; Co</a>
  <a class="result__snippet" href="x">Plant <b>protein</b> isolate from yellow peas</a>
  <a rel="nofollow" class="result__a" href="https://duckduckgo.com/y.js?ad=1">Ad</a><a class="result__snippet" href="x">ad</a>`;
  const r = parseDuckDuckGo(html);
  assert.equal(r.length, 1);
  assert.equal(r[0].url, 'https://phytokana.com/');
  assert.equal(r[0].title, 'Phytokana & Co');
  assert.equal(r[0].snippet, 'Plant protein isolate from yellow peas');
});

test('Bing HTML results are parsed', () => {
  const html = `<li class="b_algo"><h2><a href="https://www.linkedin.com/company/phytokana">Phytokana | LinkedIn</a></h2><div class="b_caption"><p>Phytokana Ingredients | 1,234 followers on LinkedIn.</p></div></li>`;
  const r = parseBing(html);
  assert.equal(r[0].url, 'https://www.linkedin.com/company/phytokana');
  assert.equal(followersIn(r[0].snippet, 'LinkedIn'), 1234);
});

test('follower counts: commas, K/M, subscribers, Instagram meta', () => {
  assert.equal(followersIn('Acme | 12,345 followers on LinkedIn', 'LinkedIn'), 12345);
  assert.equal(followersIn('1.2K Followers, 30 Following, 99 Posts', 'Instagram'), 1200);
  assert.equal(followersIn('3.4M subscribers', 'YouTube'), 3400000);
  assert.equal(followersIn('no number here', 'LinkedIn'), null);
  assert.equal(parseCount('2,500'), 2500);
});

test('grade: always a letter on the published scale, provisional when counts are missing', () => {
  assert.equal(computeGrade([]).letter, 'D');
  const p = computeGrade([{ channel: 'LinkedIn', url: 'x' }]);
  assert.equal(p.letter, 'C−'); assert.equal(p.provisional, true);
  assert.equal(computeGrade([{ channel: 'LinkedIn', audience: 120000 }, { channel: 'X / Twitter', audience: 20000 }, { channel: 'YouTube', audience: 5000 }]).letter, 'A+');
  assert.equal(computeGrade([{ channel: 'LinkedIn', audience: 3000 }]).letter, 'B−');
  assert.equal(computeGrade([{ channel: 'LinkedIn', audience: 700 }]).letter, 'C');
  for (const n of [0, 100, 400, 900, 1500, 4000, 7000, 15000, 30000, 60000]) assert.ok(GRADES.includes(computeGrade([{ channel: 'LinkedIn', audience: n }]).letter));
});

test('invented figures are removed (the Phytokana "$100 million / 1,000 accounts" sentence)', () => {
  const corpus = 'Phytokana filed a Form D on 2026-11-02. Contracted offtake of ~$450M. Strathmore, Alberta.';
  const r = verifyNumbers('The company has a contracted offtake of ~$450M. 1,000 target US accounts could generate $100 million a year. They are in Alberta.', corpus);
  assert.match(r.text, /\$450M/);
  assert.doesNotMatch(r.text, /100 million/);
  assert.match(r.text, /Alberta/);
  assert.ok(r.removed.length >= 1);
});

test('years and single digits are not treated as figures', () => {
  assert.equal(verifyNumbers('Founded in 2022, they plan 3 pilots.', '').text, 'Founded in 2022, they plan 3 pilots.');
});

test('a generic "Gershon can help them" angle is not prospect-specific', () => {
  const prospect = 'Phytokana builds a dry-fractionation plant-protein facility in Strathmore, Alberta from yellow peas.';
  const kb = 'Gershon Consulting: 200+ clients, LinkedIn outbound, social selling, US presence since 2013.';
  assert.equal(prospectSpecific("Gershon Consulting's 200+ clients and LinkedIn outbound expertise can help them enter the US market.", prospect, kb), false);
  assert.equal(prospectSpecific('Their Strathmore dry-fractionation facility needs US offtake partners — LinkedIn outbound to US food formulators.', prospect, kb), true);
});

test('gpt-oss Responses output and fenced JSON are read', () => {
  const out = { output: [{ type: 'reasoning', content: [{ text: 'thinking' }] }, { type: 'message', content: [{ type: 'output_text', text: 'Here:\n```json\n{"lead_with":[{"title":"a {b}"}]}\n```' }] }] };
  assert.deepEqual(firstJson(textOf(out)), { lead_with: [{ title: 'a {b}' }] });
  assert.equal(textOf({ response: 'x' }), 'x');
});

const RESEARCH = {
  provider: 'test', facts: 5,
  about: [{ title: 'Phytokana', url: 'https://a', snippet: 'Phytokana builds a dry-fractionation facility in Strathmore' }],
  news: [{ title: 'Phytokana files Form D', url: 'https://n', snippet: 'US investor raise', date: '2026-11-02' }],
  person: [], events: [], registry: [{ source: 'SEC EDGAR (Form D)', url: 'https://sec', text: '**Form D** filed with the SEC on 2026-11-02.' }],
  social: [{ channel: 'LinkedIn', url: 'https://www.linkedin.com/company/phytokana', audience: 1800, how: 'search snippet' }],
  grade: computeGrade([{ channel: 'LinkedIn', audience: 1800 }]),
  corpus: 'Phytokana builds a dry-fractionation facility in Strathmore from yellow peas. Form D filed 2026-11-02. Contracted offtake ~$450M. LinkedIn 1800 followers. Natural Products Expo West, Anaheim, March 3-6 2027. IFT FIRST Chicago July 2027. US food formulators.',
};
const AI = {
  context: 'Call scheduled after Chris replied to the intro email.',
  snapshot: [{ label: 'HQ', value: 'Calgary, Alberta' }, { label: 'Funding', value: 'Form D filed 2026-11-02' }],
  icp_fit: { verdict: 'Possible fit', why: 'Canadian, selling into US food formulators.' },
  lead_with: [
    { title: 'Strathmore facility needs US offtake', text: 'The **dry-fractionation** facility in Strathmore turns yellow peas into isolate — US food formulators are the buyers to line up.' },
    { title: 'The Form D raise', text: 'A **Form D** filed 2026-11-02 shows US investors in the round — US formulators will ask about supply security.' },
    { title: 'Contracted offtake', text: 'The **~$450M** contracted offtake gives proof for US formulators. 1,000 accounts could bring $100 million.' },
    { title: 'Generic', text: 'Gershon Consulting can help them expand into the US market.' },
  ],
  person: 'Chris Theal founded Phytokana and leads the Strathmore build-out; long Alberta entrepreneur track record from the website.',
  company: 'Phytokana builds a dry-fractionation facility in Strathmore. It makes pea protein isolate from yellow peas.',
  history: { said: 'Wants to learn how US customers are engaged.', proposed: 'Intro call.', open_items: ['Send the method guide'] },
  hooks: ['Form D filed 2026-11-02'],
  industry: [{ title: 'Pea protein in the US', text: 'US food formulators look for non-soy proteins.' }],
  talking_points: ['a Strathmore', 'b Form D', 'c offtake', 'd yellow peas', 'e formulators', 'f isolate', 'g Calgary'],
  events: [{ name: 'Natural Products Expo West', when_where: 'March 3-6 2027, Anaheim', note: 'Formulators', from_search: true }, { name: 'IFT FIRST', when_where: 'July 2027, Chicago', note: 'Food science', from_search: true }],
  attention: [{ title: 'Priority blank in Streak', text: 'Set it.' }],
};
const LEAD = { company: 'Phytokana Ingredients', leadName: 'Chris Theal', leadRole: 'CEO', leadEmail: 'ctheal@phytokana.com', stage: '3. Call Scheduled', notes: '', conversation: 'Chris replied, wants to learn how US customers are engaged.' };
const SITE = { ok: true, text: 'Phytokana Ingredients, Calgary, Alberta. Pea protein isolate from yellow peas. Strathmore facility.' };

function build(ai = AI, research = RESEARCH) {
  const data = assemble({ ai, research, lead: LEAD, site: SITE, domain: 'phytokana.com', clientName: 'Gershon Consulting', financials: null,
    corpusAll: `${research.corpus}\n${SITE.text}\n${LEAD.conversation}`, how: 'contact work email', kb: 'Gershon Consulting: 200+ clients, LinkedIn outbound, US presence.', model: 'test' });
  return { ...data, auto: true, engine: 'research-v2', site_read: true };
}

test('a researched brief: grade, sourced lead-with, figures checked, quality passes, Ansana order', () => {
  const d = build();
  assert.equal(d.grade.letter, 'C+');
  assert.equal(d.lead_with.length, 3);                                         // generic angle dropped
  assert.ok(d.lead_with.every((x) => !/100 million/.test(x.text)));            // invented figure dropped
  assert.ok(d.attention.some((a) => a.title === 'Figures removed'));
  assert.match(d.financials.text, /Form D/);
  assert.equal(d.social.rows[0].audience, '1,800 followers');
  assert.deepEqual(briefQuality(d), { ok: true, missing: [] });
  const html = renderBrief(d).toUpperCase();
  const order = ['SOCIAL NETWORK EFFECTIVENESS GRADE', 'SNAPSHOT', 'LEAD WITH THIS', 'THE PERSON', 'THE COMPANY', 'FINANCIALS', 'PREVIOUS CONVERSATION', 'LINKEDIN &AMP; SOCIAL INTELLIGENCE', 'INDUSTRY PULSE', 'SUGGESTED TALKING POINTS', 'NEXT IMPORTANT US EVENTS', 'NEEDS YOUR ATTENTION', 'SOURCES'];
  let at = -1;
  for (const t of order) { const i = html.indexOf(t); assert.ok(i > at, `${t} out of order`); at = i; }
  assert.ok(!html.includes('NOT RATED'));
  assert.ok(!html.includes('RECENT POSTS NOT CHECKED'));                        // LinkedIn gaps folded into one line
});

test('the Phytokana-style brief (no outside research, generic angles, no events) is held', () => {
  const thin = { ...RESEARCH, facts: 0, about: [], news: [], registry: [], social: [], grade: computeGrade([]) };
  const generic = { ...AI, lead_with: [{ title: 'US Market Entry', text: "Gershon Consulting's 200+ clients can help them enter the US market." }, { title: 'Growth', text: 'A tailored approach to US market entry.' }], events: [], industry: [] };
  const q = briefQuality(build(generic, thin));
  assert.equal(q.ok, false);
  for (const m of ['lead with this', 'outside research', 'next US events', 'industry pulse']) assert.ok(q.missing.some((x) => x.includes(m)), m);
});

test('unrelated search results are dropped (Bing "Microsoft home page" for Phytokana)', async () => {
  const { mentions } = await import('../functions/_research.js');
  assert.equal(mentions('Microsoft - Official Home Page', 'Phytokana Ingredients'), false);
  assert.equal(mentions('Phytokana files Form D', 'Phytokana Ingredients Inc.'), true);
  assert.equal(mentions('Ansana raises seed round', 'Ansana'), true);
});

test('a collapsed snapshot row is split back into rows', async () => {
  const { splitRows } = await import('../functions/_engine.js');
  assert.deepEqual(splitRows([{ label: 'Industry|HQ', value: 'Food|Calgary' }]), [{ label: 'Industry', value: 'Food' }, { label: 'HQ', value: 'Calgary' }]);
});
