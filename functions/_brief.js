import { loadLead, generateBrief, sendEmail, rowToBrief, clientStreakKey, getSettings, logSend } from './_lib.js';
import { lookupFinancials } from './_financials.js';
import { renderBrief, renderBriefText } from './_render.js';
import { splitTypoEmails } from './_email.js';
import { planBriefEmail, briefSubject } from './_audience.js';
import { getTemplate, applyTemplate } from './_template.js';

export async function saveBrief(env, clientId, boxKey, { company, lead_name, lead_role, stage, status, data }) {
  await env.DB.prepare(
    `INSERT INTO briefs (client_id, box_key, company, lead_name, lead_role, stage, status, data, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(box_key) DO UPDATE SET
       company = excluded.company, lead_name = excluded.lead_name, lead_role = excluded.lead_role,
       stage = excluded.stage, status = excluded.status, data = excluded.data, updated_at = datetime('now')`
  ).bind(clientId, boxKey, company || '', lead_name || '', lead_role || '', stage || '', status, JSON.stringify(data)).run();
  return rowToBrief(await env.DB.prepare('SELECT * FROM briefs WHERE box_key = ?').bind(boxKey).first());
}

// Draft brief for a new Streak box. Never overwrites a researched ("ready") brief.
export async function buildDraft(env, clientRow, boxKey) {
  const existing = await env.DB.prepare('SELECT status FROM briefs WHERE box_key = ?').bind(boxKey).first();
  if (existing?.status === 'ready') return rowToBrief(await env.DB.prepare('SELECT * FROM briefs WHERE box_key = ?').bind(boxKey).first());

  const lead = await loadLead(await clientStreakKey(env, clientRow.id), boxKey);
  return buildDraftFromLead(env, clientRow, boxKey, lead);
}

// Same, from a lead we assembled ourselves (e.g. a calendar attendee who is not in Streak).
export async function buildDraftFromLead(env, clientRow, boxKey, lead, extra = {}) {
  const existing = await env.DB.prepare('SELECT status FROM briefs WHERE box_key = ?').bind(boxKey).first();
  if (existing?.status === 'ready') return rowToBrief(await env.DB.prepare('SELECT * FROM briefs WHERE box_key = ?').bind(boxKey).first());
  const team = (await env.DB.prepare(
    'SELECT name, title, background FROM members WHERE client_id = ?'
  ).bind(clientRow.id).all()).results;
  const tpl = await getTemplate(env, clientRow.id);
  const financials = await lookupFinancials(env, lead);
  const data = await generateBrief(env, { lead, clientName: clientRow.name.replace(/^#\d+\s*/, ''), team, financials, company: tpl.company, icp: tpl.icp });
  if (extra.header) data.header = { ...data.header, ...extra.header };

  return saveBrief(env, clientRow.id, boxKey, {
    company: lead.company, lead_name: lead.leadName, lead_role: lead.leadRole, stage: lead.stage, status: 'draft', data,
  });
}

// Email a brief to the client's team. Off until EMAIL_ENABLED = "true" (final format approval).
// Recipients: the addresses listed in Settings, plus every member who ticked "email me".
// Addresses on known look-alike domains (e.g. gershconsulting.com) are skipped and logged.
export async function recipients(env, clientId) {
  const s = await getSettings(env, clientId);
  const listed = String(s?.recipients || '').split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  const members = (await env.DB.prepare(
    'SELECT email FROM members WHERE client_id = ? AND notify = 1 AND is_admin = 0'
  ).bind(clientId).all()).results.map((r) => r.email.toLowerCase());
  const { ok, typos } = splitTypoEmails([...new Set([...listed, ...members])]);
  for (const t of typos) console.warn(`[talkingpoints] skipping recipient ${t.email}: typo domain, did you mean ${t.suggestion}?`);
  return ok;
}

export async function emailBrief(env, clientRow, brief, { force = false, subjectDate } = {}) {
  if (env.EMAIL_ENABLED !== 'true' || (brief.emailed_at && !force)) return false;
  const to = await recipients(env, clientRow.id);
  if (!to.length) return false;
  // Any recipient outside Gershon -> client version (no internal blocks, sender "Gershon Consulting").
  const plan = planBriefEmail(to, applyTemplate(brief.data, await getTemplate(env, clientRow.id)));
  const date = subjectDate || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
  const who = { client_id: clientRow.id, box_key: brief.box_key, company: brief.company, lead_name: brief.lead_name, sent_by: subjectDate ? 'meeting run' : 'daily run', to };
  try {
    await sendEmail(env, {
      to,
      from: plan.from,
      subject: briefSubject(brief.company, brief.lead_name, date),
      html: renderBrief(plan.data),
      text: renderBriefText(plan.data),
    });
  } catch (e) { await logSend(env, { ...who, status: 'failed', error: e.message || e }); throw e; }
  await logSend(env, who);
  await env.DB.prepare("UPDATE briefs SET emailed_at = datetime('now') WHERE box_key = ?").bind(brief.box_key).run();
  return true;
}
