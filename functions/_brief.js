import { loadLead, generateBrief, sendEmail, rowToBrief, clientStreakKey, getSettings } from './_lib.js';
import { lookupFinancials } from './_financials.js';
import { renderBrief, renderBriefText } from './_render.js';
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
export async function recipients(env, clientId) {
  const s = await getSettings(env, clientId);
  const listed = String(s?.recipients || '').split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  const members = (await env.DB.prepare(
    'SELECT email FROM members WHERE client_id = ? AND notify = 1 AND is_admin = 0'
  ).bind(clientId).all()).results.map((r) => r.email.toLowerCase());
  return [...new Set([...listed, ...members])];
}

export async function emailBrief(env, clientRow, brief, { force = false, subjectDate } = {}) {
  if (env.EMAIL_ENABLED !== 'true' || (brief.emailed_at && !force)) return false;
  const to = await recipients(env, clientRow.id);
  if (!to.length) return false;
  const shown = applyTemplate(brief.data, await getTemplate(env, clientRow.id));
  const date = subjectDate || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  await sendEmail(env, {
    to,
    subject: `Talking Points : ${brief.company} - ${brief.lead_name || 'New lead'} - ${date}`,
    html: renderBrief(shown),
    text: renderBriefText(shown),
  });
  await env.DB.prepare("UPDATE briefs SET emailed_at = datetime('now') WHERE box_key = ?").bind(brief.box_key).run();
  return true;
}
