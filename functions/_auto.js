// Automatic talking point for a new Streak lead (Olivier, 2026-11-19): "We need to use Cloudflare AI for
// that using the format we created." When a lead lands in a client's Streak pipeline, the app builds its
// talking point itself with Cloudflare Workers AI — no Claude research — in the brief format of
// functions/_render.js, from: the Streak record (stage, contact, notes), the lead company's public website
// (from the contact's professional email), public registry financials, and the client's company, ICP and
// team. It is saved as status "ready" so the same-day run (functions/_weekly.js) sends it that afternoon.
// A researched brief published later for the same lead replaces it (saveBrief, same box_key).
import { loadLead, clientStreakKey } from './_lib.js';
import { saveBrief, samePipeline, recipients } from './_brief.js';
import { lookupFinancials } from './_financials.js';
import { getTemplate } from './_template.js';
import { parseInput, readWebsite, buildQuickBrief } from './_quick.js';

export async function buildAutoBrief(env, clientRow, boxKey, { save = true } = {}) {
  const lead = await loadLead(await clientStreakKey(env, clientRow.id), boxKey);
  // Same guard as v1.5.5: a lead is only ever briefed for the client whose pipeline it is in.
  if (!samePipeline(lead.pipelineKey, clientRow.pipeline_key)) throw new Error(`wrong_client: ${boxKey} not in ${clientRow.slug}'s pipeline`);

  const { target, site, how } = await resolveWebsite(env, lead, clientRow);
  const financials = await lookupFinancials(env, lead).catch(() => null);
  const tpl = await getTemplate(env, clientRow.id);
  const team = (await env.DB.prepare('SELECT name, title, background FROM members WHERE client_id = ? AND is_admin = 0').bind(clientRow.id).all()).results;
  const clientName = clientRow.name.replace(/^#\d+\s*/, '').replace(/\s*\([^)]*\)\s*$/, '');

  const data = await buildQuickBrief(env, {
    target,
    site, clientName, company: tpl.company, icp: tpl.icp, team, lead, financials,
  });

  const date = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/New_York' });
  data.auto = true;
  data.header = {
    ...data.header,
    company: lead.company || data.header.company,
    person: lead.leadName || data.header.person,
    role: lead.leadRole || data.header.role,
    when: `New lead · ${date}`,
    chips: [{ label: (lead.stage || 'New lead').toUpperCase(), tone: 'brand' }, ...data.header.chips.filter((c) => /^ICP/.test(c.label))],
  };
  if (financials) data.financials = { country: financials.country, text: financials.text };
  if (!data.history && lead.notes) data.history = { text: lead.notes };
  if (lead.linkedin) data.network = { summary: 'Check your mutual connections before reaching out.', items: [], link: { url: lead.linkedin, label: `Open ${lead.leadName || 'the lead'}'s LinkedIn profile` } };
  data.site_read = !!site.ok;
  data.website_from = how;
  data.quality = briefQuality(data);
  data.attention = (data.attention || []).filter((a) => a.title !== 'Quick talking point');
  data.sources = [
    { used: true, text: lead.conversation ? 'Streak: campaign pipeline record and conversation' : 'Streak: campaign pipeline record' },
    { used: !!tpl.company, text: `${clientName}: knowledge base (company, offer, proof points) and ICP` },
    ...(how ? [{ used: true, text: `Lead website found from: ${how}` }] : []),
    ...data.sources.filter((s) => !/^LinkedIn, Streak/.test(s.text)),
    { used: !!financials, text: financials ? `${financials.source}: company registry` : 'Company registry: no public financials found' },
  ];
  data.footer = `Gershon Consulting · Talking Points · prepared ${date}`;

  const row = { company: lead.company, lead_name: lead.leadName, lead_role: lead.leadRole, stage: lead.stage };
  if (!save) return { box_key: boxKey, ...row, status: 'test', data };   // test run: nothing written to D1
  return saveBrief(env, clientRow.id, boxKey, {
    company: lead.company, lead_name: lead.leadName, lead_role: lead.leadRole, stage: lead.stage, status: 'ready', data,
  });
}

// ---------- Finding the lead company's website (2026-11-23) ----------
// The AbelZeta brief went out with "Website: AbelZeta" because the lead had no work email: the engine
// then had no company facts at all. Sources, in order: a website field on the Streak box, every contact's
// work email, web addresses / emails in the Streak conversation and notes (never the client's own or
// Gershon's), then the company name as a .com (kept only if the page names the company).
const OWN = ['gershonconsulting.com', 'gershon.ai', 'gershoncrm.com', 'linkedin.com', 'streak.com', 'google.com', 'calendly.com', 'zoom.us', 'youcanbook.me', 'lnkd.in'];
const NAME_NOISE = /\b(inc|llc|ltd|gmbh|sa|sas|ag|co|corp|corporation|company|group|holdings?|plc|bv|nv|srl|spa|limited|the)\b\.?/gi;

export function companySlugs(name = '') {
  const clean = String(name).split(/\s+[-–—|/(]\s*|\s*\(/)[0].replace(NAME_NOISE, ' ').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const words = clean.toLowerCase().replace(/[^a-z0-9\s&]/g, '').split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const joined = words.join('').replace(/&/g, '');
  return [...new Set([joined, words.join('-').replace(/&/g, 'and'), words[0]])].filter((w) => w.length >= 3);
}

export function websiteCandidates(lead = {}, clientDomains = []) {
  const own = new Set([...OWN, ...clientDomains.map((d) => String(d).toLowerCase().replace(/^www\./, ''))]);
  const out = [];
  const add = (t, how) => { if (t && !t.error && !own.has(t.domain) && ![...own].some((o) => t.domain.endsWith(`.${o}`)) && !out.some((x) => x.target.domain === t.domain)) out.push({ target: t, how }); };
  if (lead.website) add(parseInput(lead.website), 'Streak website field');
  for (const e of [lead.leadEmail, ...(lead.emails || [])].filter(Boolean)) add(parseInput(e), 'contact work email');
  const text = `${lead.conversation || ''}\n${lead.notes || ''}`;
  for (const m of text.matchAll(/[\w.+-]+@([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi)) add(parseInput(m[0]), 'email address in the Streak conversation');
  for (const m of text.matchAll(/https?:\/\/[^\s)>"']+|\bwww\.[^\s)>"']+/gi)) add(parseInput(m[0]), 'link in the Streak conversation');
  for (const slug of companySlugs(lead.company)) add({ ...parseInput(`${slug}.com`), guessed: true }, `guessed from the company name (${slug}.com)`);
  return out;
}

// A guessed site must name the company, or it is someone else's site.
export function siteNamesCompany(site, company) {
  const norm = (x) => String(x || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
  const key = norm(String(company).split(/\s+[-–—|/(]/)[0].replace(NAME_NOISE, ' '));
  return !!key && key.length >= 3 && norm(`${site.name} ${site.text.slice(0, 5000)}`).includes(key);
}

async function resolveWebsite(env, lead, clientRow) {
  // The client's own domains (its team writes in the Streak conversation too): never the lead's site.
  let team = [];
  try { team = await recipients(env, clientRow.id); } catch { team = []; }
  const clientDomains = [...String(clientRow.email_domains || '').split(/[\s,;]+/), ...team.map((e) => e.split('@')[1])].filter(Boolean);
  for (const c of websiteCandidates(lead, clientDomains).slice(0, 6)) {
    const site = await readWebsite(c.target);
    if (site.ok && (!c.target.guessed || siteNamesCompany(site, lead.company))) return { target: c.target, site, how: c.how };
  }
  return { target: { kind: 'website', domain: 'not found', url: '' }, site: { ok: false, pages: [], social: [], text: '' }, how: '' };
}

// Minimum content before a talking point may go out automatically (Olivier, 2026-11-20: "too light, not
// enough information to make the email worth it"). A brief that fails is not sent by the runs (_weekly.js).
export function briefQuality(d = {}) {
  const missing = [];
  if ((d.lead_with || []).length < 3) missing.push('lead with this (3 angles)');
  if ((d.talking_points || []).length < 5) missing.push('talking points (5+)');
  if (!d.company?.text) missing.push('the company');
  if (!(d.snapshot || []).length) missing.push('snapshot');
  if (!(d.hooks || []).length) missing.push('worth using in the call');
  // 2026-11-23 (AbelZeta): a brief built without the lead's website or without an ICP verdict is a
  // skeleton — it goes to Olivier for review, never to the client team.
  if (d.auto && d.site_read === false) missing.push("the lead company's website");
  const fit = (d.header?.chips || []).find((c) => /^ICP/.test(c.label));
  if (d.auto && (!fit || /UNKNOWN/i.test(fit.label))) missing.push('ICP fit verdict');
  if (d.auto && !(d.person?.text && d.person.text.trim() !== (d.header?.role || '').trim() && d.person.text.length > 60)) missing.push('the person (more than a job title)');
  return { ok: missing.length === 0, missing };
}
