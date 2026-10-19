import { loadLead, generateBrief, sendEmail, rowToBrief } from './_lib.js';
import { lookupFinancials } from './_financials.js';
import { renderBrief, renderBriefText } from './_render.js';

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

  const lead = await loadLead(env, boxKey);
  const team = (await env.DB.prepare(
    'SELECT name, title, background FROM members WHERE client_id = ? AND is_admin = 0'
  ).bind(clientRow.id).all()).results;
  const financials = await lookupFinancials(env, lead);
  const data = await generateBrief(env, { lead, clientName: clientRow.name, team, financials });

  return saveBrief(env, clientRow.id, boxKey, {
    company: lead.company, lead_name: lead.leadName, lead_role: lead.leadRole, stage: lead.stage, status: 'draft', data,
  });
}

// Email a brief to the client's team. Off until EMAIL_ENABLED = "true" (final format approval).
export async function emailBrief(env, clientRow, brief) {
  if (env.EMAIL_ENABLED !== 'true' || brief.emailed_at) return false;
  const to = (await env.DB.prepare(
    'SELECT email FROM members WHERE client_id = ? AND notify = 1 AND is_admin = 0'
  ).bind(clientRow.id).all()).results.map((r) => r.email);
  if (!to.length) return false;
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  await sendEmail(env, {
    to,
    subject: `Talking Points : ${brief.company} - ${brief.lead_name || 'New lead'} - ${date}`,
    html: renderBrief(brief.data),
    text: renderBriefText(brief.data),
  });
  await env.DB.prepare("UPDATE briefs SET emailed_at = datetime('now') WHERE box_key = ?").bind(brief.box_key).run();
  return true;
}
