// Automatic talking point for a new Streak lead (Olivier, 2026-11-19): "We need to use Cloudflare AI for
// that using the format we created." When a lead lands in a client's Streak pipeline, the app builds its
// talking point itself with Cloudflare Workers AI — no Claude research — in the brief format of
// functions/_render.js, from: the Streak record (stage, contact, notes), the lead company's public website
// (from the contact's professional email), public registry financials, and the client's company, ICP and
// team. It is saved as status "ready" so the same-day run (functions/_weekly.js) sends it that afternoon.
// A researched brief published later for the same lead replaces it (saveBrief, same box_key).
import { loadLead, clientStreakKey } from './_lib.js';
import { saveBrief, samePipeline } from './_brief.js';
import { lookupFinancials } from './_financials.js';
import { getTemplate } from './_template.js';
import { parseInput, readWebsite, buildQuickBrief } from './_quick.js';

export async function buildAutoBrief(env, clientRow, boxKey, { save = true } = {}) {
  const lead = await loadLead(await clientStreakKey(env, clientRow.id), boxKey);
  // Same guard as v1.5.5: a lead is only ever briefed for the client whose pipeline it is in.
  if (!samePipeline(lead.pipelineKey, clientRow.pipeline_key)) throw new Error(`wrong_client: ${boxKey} not in ${clientRow.slug}'s pipeline`);

  const target = lead.leadEmail ? parseInput(lead.leadEmail) : { error: 'no email' };
  const site = target.error ? { ok: false, pages: [], social: [], text: '' } : await readWebsite(target);
  const financials = await lookupFinancials(env, lead).catch(() => null);
  const tpl = await getTemplate(env, clientRow.id);
  const team = (await env.DB.prepare('SELECT name, title, background FROM members WHERE client_id = ? AND is_admin = 0').bind(clientRow.id).all()).results;
  const clientName = clientRow.name.replace(/^#\d+\s*/, '').replace(/\s*\([^)]*\)\s*$/, '');

  const data = await buildQuickBrief(env, {
    target: target.error ? { kind: 'website', domain: lead.company || 'unknown', url: '' } : target,
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
  if (lead.notes) data.history = { text: lead.notes };
  data.attention = (data.attention || []).filter((a) => a.title !== 'Quick talking point');
  data.sources = [
    { used: true, text: 'Streak: campaign pipeline record' },
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
