// Research pass for an automatic talking point (v1.16.0, Olivier 2026-11-26: "Our structure is fundamental
// to follow. Grade and research are important."). The Phytokana talking point of Nov 25 went out with no
// grade, no financials, no news and an invented "$100M" figure because the engine only read the Streak box
// and the lead's home page. This module gathers real, sourced facts BEFORE the AI writes anything:
//
//   web search    company, person, news, US events of the sector  (Tavily or Brave when a key is set,
//                 otherwise keyless DuckDuckGo / Bing HTML; every result keeps its URL)
//   social audit  follower counts per channel (LinkedIn, Instagram, YouTube, X, Facebook, TikTok) read
//                 from the public page or, when the page is walled, from the search snippet of that page
//   registries    GLEIF (legal entity, country, parent — worldwide, no key) and SEC EDGAR Form D
//                 (private US raises, e.g. Phytokana's Nov 2026 Form D); France/UK/US-listed stay in _financials.js
//   grade         computed from the follower counts (never "not rated"; "provisional" when counts are missing)
//
// Everything returned carries its source so the brief's Sources block is real and the number check
// (verifyNumbers) can reject any figure the AI did not get from here.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const decode = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/\s+/g, ' ').trim();

async function fetchText(url, init = {}) {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(init.timeout || 8000), ...init, headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9', ...(init.headers || {}) } });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}
async function fetchJson(url, init = {}) {
  const t = await fetchText(url, { ...init, headers: { accept: 'application/json', ...(init.headers || {}) } });
  try { return t ? JSON.parse(t) : null; } catch { return null; }
}

// ---------- Web search ----------
// Parsers are exported for the tests (fixtures of the real HTML).
export function parseDuckDuckGo(html) {
  const out = [];
  for (const m of String(html || '').matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)) {
    let url = decode(m[1]);
    const uddg = url.match(/[?&]uddg=([^&]+)/);
    if (uddg) url = decodeURIComponent(uddg[1]);
    if (/duckduckgo\.com\/y\.js/.test(url)) continue;   // ads
    out.push({ title: decode(m[2]), url, snippet: decode(m[3]) });
  }
  return out;
}
export function parseBing(html) {
  const out = [];
  for (const block of String(html || '').split(/<li class="b_algo"/).slice(1)) {
    const a = block.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const p = block.match(/<p[^>]*>([\s\S]*?)<\/p>/) || block.match(/class="b_caption"[^>]*>([\s\S]*?)<\/div>/);
    out.push({ title: decode(a[2]), url: decode(a[1]), snippet: decode(p ? p[1] : '') });
  }
  return out;
}

async function searchTavily(env, q, { news = false, n = 6 } = {}) {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ api_key: env.TAVILY_API_KEY, query: q, max_results: n, search_depth: 'advanced', topic: news ? 'news' : 'general', ...(news ? { days: 365 } : {}) }),
  }).catch(() => null);
  if (!res?.ok) return null;
  const j = await res.json().catch(() => null);
  return (j?.results || []).map((r) => ({ title: r.title || '', url: r.url || '', snippet: String(r.content || '').slice(0, 600), date: r.published_date || '' }));
}
async function searchBrave(env, q, { news = false, n = 6 } = {}) {
  const j = await fetchJson(`https://api.search.brave.com/res/v1/${news ? 'news' : 'web'}/search?q=${encodeURIComponent(q)}&count=${n}${news ? '&freshness=py' : ''}`,
    { headers: { 'x-subscription-token': env.BRAVE_API_KEY } });
  const list = news ? j?.results : j?.web?.results;
  if (!Array.isArray(list)) return null;
  return list.map((r) => ({ title: decode(r.title), url: r.url, snippet: decode(r.description), date: r.age || r.page_age || '' }));
}
async function searchKeyless(q, { n = 6 } = {}) {
  const ddg = await fetchText('https://html.duckduckgo.com/html/', { method: 'POST', body: `q=${encodeURIComponent(q)}&kl=us-en`, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  let r = parseDuckDuckGo(ddg);
  if (r.length < 2) r = parseBing(await fetchText(`https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=en&cc=US`));
  return r.slice(0, n);
}

// One search. Returns [{ title, url, snippet, date? }] (empty when nothing could be reached).
export async function webSearch(env, q, opts = {}) {
  try {
    if (env.TAVILY_API_KEY) { const r = await searchTavily(env, q, opts); if (r) return r; }
    if (env.BRAVE_API_KEY) { const r = await searchBrave(env, q, opts); if (r) return r; }
    return await searchKeyless(q, opts);
  } catch { return []; }
}
export const searchProvider = (env) => (env.TAVILY_API_KEY ? 'Tavily' : env.BRAVE_API_KEY ? 'Brave Search' : 'DuckDuckGo / Bing');

// ---------- Social audit ----------
// "12,345 followers", "1.2K followers", "3.4M subscribers", "567 Followers, 12 Following".
export function parseCount(s) {
  const m = String(s || '').replace(/,(?=\d{3}\b)/g, '').match(/(\d+(?:[.,]\d+)?)\s*([kKmM])?\b/);
  if (!m) return null;
  let n = parseFloat(m[1].replace(',', '.'));
  if (/k/i.test(m[2] || '')) n *= 1e3;
  if (/m/i.test(m[2] || '')) n *= 1e6;
  return Math.round(n);
}
const WORD = { LinkedIn: 'followers', Instagram: 'followers', 'X / Twitter': 'followers', Facebook: '(?:followers|likes)', YouTube: 'subscribers', TikTok: 'followers' };
export function followersIn(text, channel) {
  const w = WORD[channel] || 'followers';
  const m = String(text || '').replace(/&nbsp;/g, ' ').match(new RegExp(`(\\d[\\d,.]*\\s*[KkMm]?)\\s*${w}`, 'i'));
  return m ? parseCount(m[1]) : null;
}

export const CHANNELS = [
  ['LinkedIn', /linkedin\.com\/(company|school|showcase)\//i, 'site:linkedin.com/company'],
  ['X / Twitter', /(?:^|\/\/)(?:www\.)?(twitter|x)\.com\/[A-Za-z0-9_]+\/?$/i, 'site:x.com'],
  ['Instagram', /instagram\.com\/[^/?#]+/i, 'site:instagram.com'],
  ['YouTube', /youtube\.com\/(@|c\/|channel\/|user\/)/i, 'site:youtube.com'],
  ['Facebook', /facebook\.com\/[^/?#]+/i, 'site:facebook.com'],
  ['TikTok', /tiktok\.com\/@/i, 'site:tiktok.com'],
];

// Social channels: links found on the website first, then a search for a LinkedIn company page.
// Each channel gets its audience from the public page, else from the search snippet of that page.
export async function socialAudit(env, company, siteSocial = []) {
  const found = new Map();
  for (const s of siteSocial) {
    const ch = CHANNELS.find(([name, re]) => re.test(s.url) && (name === s.channel || !found.has(name)));
    if (ch && !found.has(ch[0])) found.set(ch[0], { channel: ch[0], url: s.url, from: 'website' });
  }
  if (!found.has('LinkedIn')) {
    const hits = await webSearch(env, `"${company}" LinkedIn company page`, { n: 5 });
    const h = hits.find((x) => CHANNELS[0][1].test(x.url));
    if (h) found.set('LinkedIn', { channel: 'LinkedIn', url: h.url.split('?')[0], from: 'web search', snippet: `${h.title} ${h.snippet}` });
  }
  const rows = [];
  for (const c of found.values()) {
    let audience = followersIn(c.snippet, c.channel);
    let how = audience != null ? 'search snippet' : '';
    if (audience == null) {
      const html = await fetchText(c.url, { timeout: 6000 });
      const metaText = html ? (html.match(/<meta[^>]+(?:name|property)=["'](?:og:)?description["'][^>]*>/gi) || []).join(' ') : '';
      audience = followersIn(metaText, c.channel) ?? followersIn(html && html.slice(0, 400000), c.channel);
      if (audience != null) how = 'public page';
    }
    if (audience == null) {
      const slug = c.url.replace(/\/$/, '').split('/').pop();
      const hits = await webSearch(env, `${CHANNELS.find(([n]) => n === c.channel)[2]} ${slug} ${WORD[c.channel] === 'subscribers' ? 'subscribers' : 'followers'}`, { n: 5 });
      const h = hits.find((x) => x.url.toLowerCase().includes(slug.toLowerCase()) && followersIn(`${x.title} ${x.snippet}`, c.channel) != null);
      if (h) { audience = followersIn(`${h.title} ${h.snippet}`, c.channel); how = 'search snippet'; }
    }
    rows.push({ ...c, audience, how });
  }
  return rows;
}

// ---------- Grade (the published scale; no D+ / D−) ----------
export const GRADES = ['A+', 'A', 'A−', 'B+', 'B', 'B−', 'C+', 'C', 'C−', 'D'];
export function computeGrade(rows = []) {
  const counted = rows.filter((r) => Number.isFinite(r.audience));
  const total = counted.reduce((s, r) => s + r.audience, 0);
  const top = counted.reduce((m, r) => Math.max(m, r.audience), 0);
  const channels = rows.length;
  const fmtN = (n) => n.toLocaleString('en-US');
  const list = rows.map((r) => `${r.channel} ${Number.isFinite(r.audience) ? fmtN(r.audience) : 'audience not readable'}`).join(' · ');
  if (!channels) {
    return { letter: 'D', provisional: false, headline: 'No social presence found: no LinkedIn page or other network linked from the website or found in search.', detail: 'For a company selling into the US this is the first gap to close — buyers who look them up find nothing to engage with.' };
  }
  if (!counted.length) {
    const letter = channels >= 4 ? 'C+' : channels >= 2 ? 'C' : 'C−';
    return { letter, provisional: true, headline: `${channels} channel${channels > 1 ? 's' : ''} found, audiences not readable this run — grade is provisional.`, detail: `${list}. Grade based on the number of channels only; check the follower counts before quoting it.` };
  }
  let letter;
  if (total >= 100000 && channels >= 3) letter = 'A+';
  else if (total >= 50000) letter = 'A';
  else if (total >= 20000) letter = 'A−';
  else if (total >= 10000 || top >= 8000) letter = 'B+';
  else if (total >= 5000) letter = 'B';
  else if (total >= 2000) letter = 'B−';
  else if (total >= 1000) letter = 'C+';
  else if (total >= 500) letter = 'C';
  else if (total >= 150) letter = 'C−';
  else letter = 'D';
  const missing = rows.length - counted.length;
  const reach = total >= 20000 ? 'a strong audience' : total >= 2000 ? 'a modest audience' : total >= 500 ? 'a small audience' : 'very little reach';
  return {
    letter,
    provisional: missing > 0 && letter !== 'A+',
    headline: `${fmtN(total)} followers across ${counted.length} channel${counted.length > 1 ? 's' : ''} — ${reach}${channels === 1 ? ', on one network only' : ''}.`,
    detail: `${list}.${missing ? ` ${missing} channel${missing > 1 ? 's' : ''} could not be read, so the grade may be slightly low.` : ''}`,
  };
}

// ---------- Registries ----------
export async function gleif(company) {
  const name = String(company).split(/\s+[-–—|(]/)[0].trim();
  const j = await fetchJson(`https://api.gleif.org/api/v1/fuzzycompletions?field=entity.legalName&q=${encodeURIComponent(name)}`);
  const id = j?.data?.[0]?.relationships?.['lei-records']?.data?.id;
  if (!id) return null;
  const rec = await fetchJson(`https://api.gleif.org/api/v1/lei-records/${id}`);
  const a = rec?.data?.attributes;
  if (!a) return null;
  const legal = a.entity?.legalName?.name || '';
  const norm = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!norm(legal).includes(norm(name).slice(0, 6))) return null;   // fuzzy match must really be this company
  const addr = a.entity?.legalAddress || {};
  let parent = '';
  const p = await fetchJson(`https://api.gleif.org/api/v1/lei-records/${id}/direct-parent`);
  if (p?.data?.attributes?.entity?.legalName?.name) parent = p.data.attributes.entity.legalName.name;
  return {
    source: 'GLEIF (Legal Entity Identifier register)', url: `https://search.gleif.org/#/record/${id}`,
    text: `Legal entity: **${legal}** (LEI ${id}), ${[addr.city, addr.country].filter(Boolean).join(', ')}; status ${a.entity?.status || 'n/a'}${a.entity?.creationDate ? `, created ${a.entity.creationDate.slice(0, 10)}` : ''}.${parent ? ` Direct parent: **${parent}**.` : ''}`,
  };
}

// SEC EDGAR full-text search: Form D = private raise reported to the SEC (any country).
export async function secFormD(company) {
  const name = String(company).split(/\s+[-–—|(]/)[0].trim();
  const ua = { 'user-agent': 'Gershon Consulting talkingpoints@gershon.ai', accept: 'application/json' };
  let hits = [];
  for (const term of [`"${name}"`, name.split(/\s+/)[0]]) {
    const res = await fetch(`https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(term)}&forms=D,D/A`, { headers: ua, signal: AbortSignal.timeout(8000) }).catch((e) => { throw new Error(`sec fetch: ${e.message}`); });
    if (!res.ok) throw new Error(`sec http ${res.status}`);
    const j = await res.json();
    hits = (j?.hits?.hits || []).map((h) => h._source).filter((x) => x && mentions((x.display_names || []).join(' '), name));
    if (hits.length) break;
  }
  if (!hits.length) return null;
  const latest = hits.sort((a, b) => String(b.file_date).localeCompare(String(a.file_date)))[0];
  const cik = String(latest.ciks?.[0] || '').replace(/^0+/, '');
  const adsh = String(latest.adsh || '');
  let amount = '';
  if (cik && adsh) {
    const xml = await fetchText(`https://www.sec.gov/Archives/edgar/data/${cik}/${adsh.replace(/-/g, '')}/primary_doc.xml`, { headers: { 'user-agent': 'Gershon Consulting talkingpoints@gershon.ai' } });
    const tot = (xml || '').match(/<totalOfferingAmount>([^<]+)</)?.[1];
    const sold = (xml || '').match(/<totalAmountSold>([^<]+)</)?.[1];
    const money = (v) => (/^\d+$/.test(v || '') ? `$${Number(v).toLocaleString('en-US')}` : v);
    if (tot || sold) amount = ` Offering ${money(tot) || 'n/a'}, sold so far ${money(sold) || 'n/a'}.`;
  }
  return {
    source: 'SEC EDGAR (Form D)', url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=D`,
    text: `**Form D** filed with the SEC on ${latest.file_date} by ${String(latest.display_names?.[0] || name).replace(/\s*\(CIK.*$/, '').trim()} — a private raise from US investors.${amount}${hits.length > 1 ? ` ${hits.length} Form D filings in total.` : ''}`,
  };
}

// ---------- The whole pass ----------
// Runs the searches in parallel; returns facts with sources and one text corpus for the AI.
// Market where the client sells (2026-11-26, Altavia / Kawartha Dairy got US shows for an Ontario dairy):
// events and the events search follow the client's ICP geography, not always the US.
export function targetMarket(icp = '') {
  const t = String(icp);
  const ca = (t.match(/\bcanad(a|ian)\b/gi) || []).length;
  const us = (t.match(/\b(united states|u\.s\.a?|usa|us market|american)\b/gi) || []).length;
  return ca > 0 && ca >= us ? { name: 'Canada', where: 'Canada', short: 'Canadian' } : { name: 'US', where: 'United States', short: 'US' };
}

export async function research(env, { company, person, role, domain, siteSocial = [], industryHint = '', market = targetMarket('') }) {
  const q = (s) => s.replace(/\s+/g, ' ').trim();
  const name = String(company || '').split(/\s+[-–—|(]/)[0].trim();
  let formDErr = '';
  const [about, news, who, social, entity, formD] = await Promise.all([
    webSearch(env, q(`"${name}" ${domain || ''} company`), { n: 6 }),
    webSearch(env, q(`"${name}" news`), { news: true, n: 6 }),
    person ? webSearch(env, q(`"${person}" ${name} ${role || ''}`), { n: 6 }) : Promise.resolve([]),
    socialAudit(env, name, siteSocial),
    gleif(name).catch(() => null),
    secFormD(name).catch((e) => { formDErr = String(e.message || e); return null; }),
  ]);
  const own = (u) => domain && String(u).includes(domain);
  // Keyless search engines sometimes answer with unrelated pages (Bing "Microsoft home page"): keep only
  // results that name the company (or, for the person search, the person).
  const keep = (list, must = name) => list.filter((r) => r.url && (r.snippet || r.title) && mentions(`${r.title} ${r.snippet} ${r.url}`, must));
  const events = industryHint ? (await Promise.all([
    webSearch(env, q(`${industryHint} conference 2027 ${market.where}`), { n: 8 }),
    webSearch(env, q(`${industryHint} trade show 2027 ${market.where} dates`), { n: 8 }),
  ])).flat().filter((r, i, a) => r.url && /20(27|28)|2026/.test(`${r.title} ${r.snippet}`) && /conference|expo|summit|congress|trade show|annual meeting|convention/i.test(`${r.title} ${r.snippet}`) && a.findIndex((x) => x.url === r.url) === i) : [];
  const r = {
    market: market.name,
    provider: searchProvider(env),
    about: keep(about).filter((x) => !own(x.url) || about.length < 3),
    news: keep(news),
    person: keep(who, person || name),
    events: events.slice(0, 10),
    diagnostics: { gleif: entity ? 'found' : 'none', sec_form_d: formD ? 'found' : (formDErr || 'none') },
    social,
    grade: computeGrade(social),
    registry: [entity, formD].filter(Boolean),
  };
  const block = (title, list) => (list.length ? `${title}\n${list.map((x, i) => `[${i + 1}] ${x.title}${x.date ? ` (${x.date})` : ''} — ${x.snippet} <${x.url}>`).join('\n')}` : `${title}\n(nothing found)`);
  r.corpus = [
    block('WEB RESULTS ABOUT THE COMPANY', r.about),
    block('NEWS (last 12 months)', r.news),
    block('WEB RESULTS ABOUT THE PERSON', r.person),
    `SOCIAL CHANNELS\n${social.length ? social.map((s) => `${s.channel}: ${s.url} — ${Number.isFinite(s.audience) ? `${s.audience} ${WORD[s.channel] === 'subscribers' ? 'subscribers' : 'followers'}` : 'audience not readable'}`).join('\n') : '(none found)'}`,
    `REGISTRIES\n${r.registry.length ? r.registry.map((x) => `${x.source}: ${x.text}`).join('\n') : '(nothing found)'}`,
    block(`${market.name.toUpperCase()} EVENTS SEARCH (use only events listed here, with the dates shown)`, r.events),
  ].join('\n\n');
  r.facts = r.about.length + r.news.length + r.person.length + r.registry.length;
  return r;
}

// Does this text name the company / person? (first distinctive word of the name, accents ignored)
export function mentions(text, name) {
  const norm = (x) => String(x || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const words = norm(name).replace(/\b(inc|llc|ltd|gmbh|sa|sas|ag|bv|nv|corp|co|the|group|holdings?)\b\.?/g, ' ').split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  if (!words.length) return true;
  const t = norm(text);
  return t.includes(words[0]) || (words[1] && words[1].length >= 5 && t.includes(words[1]));
}

// ---------- Number check ----------
// Every figure the AI writes must appear in what it was given (research corpus, website, Streak,
// knowledge base). A sentence carrying a figure found nowhere is removed — this is what stops a
// "$100 million from 1,000 accounts" from reaching a client.
const NUM = /(?:[$€£]\s?)?\d[\d,.]*\s?(?:%|[kKmMbB]n?\b|million|billion)?/g;
const digits = (s) => String(s).replace(/[^\d]/g, '').replace(/^0+/, '');
export function verifyNumbers(text, corpus) {
  const pool = String(corpus || '');
  const poolDigits = new Set((pool.match(/\d[\d,.]*/g) || []).map(digits));
  const removed = [];
  const keepSentence = (sent) => {
    for (const n of sent.match(NUM) || []) {
      const d = digits(n);
      if (!d || d.length < 2) continue;                       // 1–9: list numbers, "3 angles"
      if (/^(19|20)\d\d$/.test(d)) continue;                  // years
      if (poolDigits.has(d) || pool.includes(n.trim())) continue;
      removed.push(n.trim());
      return false;
    }
    return true;
  };
  const sentences = String(text || '').split(/(?<=[.!?])\s+/);
  const kept = sentences.filter(keepSentence);
  return { text: kept.join(' ').trim(), removed };
}
