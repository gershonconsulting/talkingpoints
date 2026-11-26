import { CLIENT_NUMBERS } from './_sources.js';
import { loadLead, generateBrief, sendEmail, rowToBrief, clientStreakKey, getSettings, logSend } from './_lib.js';
import { lookupFinancials } from './_financials.js';
import { renderBrief, renderBriefText } from './_render.js';
import { splitTypoEmails } from './_email.js';
import { planBriefEmail, briefSubject } from './_audience.js';
import { getTemplate, applyTemplate } from './_template.js';
import { briefQuality } from './_auto.js';
import { AUTO_SEND_PAUSED } from './_weekly.js';
import { hasGrade, gradeFromBrief } from './_grade.js';
import { hasIcpGrade, icpGradeFromBrief } from './_icp.js';

export async function saveBrief(env, clientId, boxKey, { company, lead_name, lead_role, stage, status, data }) {
  // Every talking point carries its Social Network Effectiveness Grade (2026-11-26): one saved without a
  // grade (Cloudflare AI talking points) gets one computed from its social table (functions/_grade.js).
  if (data && !hasGrade(data)) data = { ...data, grade: gradeFromBrief(data) };
  // ICP Match Grade (2026-11-26): a talking point without one gets it from the ICP verdict it carries.
  if (data && !hasIcpGrade(data)) { const g = icpGradeFromBrief(data); if (g) data = { ...data, icp_grade: g }; }
  await env.DB.prepare(
    `INSERT INTO briefs (client_id, box_key, company, lead_name, lead_role, stage, status, data, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(box_key) DO UPDATE SET
       company = excluded.company, lead_name = excluded.lead_name, lead_role = excluded.lead_role,
       stage = excluded.stage, status = excluded.status, data = excluded.data, updated_at = datetime('now')`
  ).bind(clientId, boxKey, company || '', lead_name || '', lead_role || '', stage || '', status, JSON.stringify(data)).run();
  return rowToBrief(await env.DB.prepare('SELECT * FROM briefs WHERE box_key = ?').bind(boxKey).first());
}

// Streak returns the same pipeline as an encoded key ("agxz…") or as "pipeline:<owner>:<id>".
export function samePipeline(a, b) {
  if (!a || !b) return false;
  return a === b || pipelineId(a) === pipelineId(b);
}
function pipelineId(k) {
  const m = String(k).match(/^pipeline:[^:]+:(\d+)$/);
  if (m) return m[1];
  try {
    // Encoded datastore key: the numeric id is the last varint after the "Workflow" kind.
    const raw = atob(String(k).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(k).length + 3) % 4));
    const i = raw.lastIndexOf('Workflow');
    if (i < 0) return String(k);
    let n = 0n, shift = 0n;
    for (let j = i + 'Workflow'.length + 1; j < raw.length; j++) {
      const c = BigInt(raw.charCodeAt(j)); n |= (c & 0x7fn) << shift; shift += 7n;
      if (!(c & 0x80n)) break;
    }
    return n.toString();
  } catch { return String(k); }
}

// Client that owns a Streak pipeline, or null.
export async function clientForPipeline(env, pipelineKey) {
  const all = (await env.DB.prepare('SELECT * FROM clients').all()).results;
  return all.find((c) => samePipeline(c.pipeline_key, pipelineKey)) || null;
}

// Draft brief for a new Streak box. Never overwrites a researched ("ready") brief.
export async function buildDraft(env, clientRow, boxKey) {
  const existing = await env.DB.prepare('SELECT status FROM briefs WHERE box_key = ?').bind(boxKey).first();
  if (existing?.status === 'ready') return rowToBrief(await env.DB.prepare('SELECT * FROM briefs WHERE box_key = ?').bind(boxKey).first());

  const lead = await loadLead(await clientStreakKey(env, clientRow.id), boxKey);
  // Guard (2026-10-30, NxGen MDx incident): a lead may only ever be briefed for the client whose
  // Streak pipeline it sits in. Never write a PhiTech lead into Finance Montréal's brief, etc.
  if (!samePipeline(lead.pipelineKey, clientRow.pipeline_key)) {
    const err = new Error(`wrong_client: box ${boxKey} is in pipeline ${lead.pipelineKey}, not ${clientRow.slug}'s`);
    err.code = 'wrong_client'; err.pipelineKey = lead.pipelineKey;
    throw err;
  }
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
// client.gershon.ai report recipients for this Talking Points client (number from "#233 …" or slug).
export async function crmReportEmails(env, clientId) {
  if (!env.CRM_KV) return [];
  const c = await env.DB.prepare('SELECT slug, name FROM clients WHERE id = ?').bind(clientId).first();
  if (!c) return [];
  const no = (String(c.name).match(/#(\d+)/) || [])[1] || CLIENT_NUMBERS[c.slug];
  if (!no) return [];
  let settings = {};
  try { settings = JSON.parse((await env.CRM_KV.get('v3:settings')) || '{}'); } catch { return []; }
  const raw = (settings.clientEmails || {})[String(no)];
  return String(Array.isArray(raw) ? raw.join(',') : raw || '').split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
}

export async function recipients(env, clientId) {
  const s = await getSettings(env, clientId);
  const listed = String(s?.recipients || '').split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  const members = (await env.DB.prepare(
    'SELECT email FROM members WHERE client_id = ? AND notify = 1 AND is_admin = 0'
  ).bind(clientId).all()).results.map((r) => r.email.toLowerCase());
  // The client's whole team (Olivier, 2026-11-11): also everyone on the client's "send report"
  // list in client.gershon.ai (v3:settings.clientEmails, by client number).
  let crm = [];
  try { crm = await crmReportEmails(env, clientId); } catch { crm = []; }
  const { ok, typos } = splitTypoEmails([...new Set([...listed, ...members, ...crm])]);
  for (const t of typos) console.warn(`[talkingpoints] skipping recipient ${t.email}: typo domain, did you mean ${t.suggestion}?`);
  return ok;
}

// `weekly`: the Friday run (Olivier's standing instruction, 2026-11-05) — sends even while the
// daily auto-email switch EMAIL_ENABLED is off; duplicates are prevented by the caller (send_log).
export async function emailBrief(env, clientRow, brief, { force = false, subjectDate, weekly = false, sentBy } = {}) {
  if ((env.EMAIL_ENABLED !== 'true' && !weekly) || (brief.emailed_at && !force)) return false;
  // Every automatic send path comes through here: an AI talking point that fails the quality check goes
  // to Olivier for review instead of the client team (2026-11-23). Re-checked with the current rules,
  // so briefs saved before this check are judged the same way.
  if (brief.data?.auto) {
    // 2026-11-26 (Phytokana): while the engine is rebuilt, no AI talking point goes to a client or the team.
    if (AUTO_SEND_PAUSED && !force) { await holdForReview(env, clientRow, { ...brief, data: { ...brief.data, quality: { ok: false, missing: ['automatic sends paused while the research engine is rebuilt'] } } }); return false; }
    const q = briefQuality(brief.data);
    if (!q.ok) { await holdForReview(env, clientRow, { ...brief, data: { ...brief.data, quality: q } }); return false; }
  }
  const to = await recipients(env, clientRow.id);
  if (!to.length) return false;
  // Any recipient outside Gershon -> client version (no internal blocks, sender "Gershon Consulting").
  const plan = planBriefEmail(to, applyTemplate(brief.data, await getTemplate(env, clientRow.id)));
  const date = subjectDate || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
  const who = { client_id: clientRow.id, box_key: brief.box_key, company: brief.company, lead_name: brief.lead_name, sent_by: sentBy || (weekly ? 'friday run' : subjectDate ? 'meeting run' : 'daily run'), to };
  try {
    await sendEmail(env, {
      to,
      from: plan.from,
      subject: briefSubject(clientRow.name, brief.company, brief.lead_name, date),
      html: renderBrief(plan.data),
      text: renderBriefText(plan.data),
    });
  } catch (e) { await logSend(env, { ...who, status: 'failed', error: e.message || e }); throw e; }
  await logSend(env, who);
  await env.DB.prepare("UPDATE briefs SET emailed_at = datetime('now') WHERE box_key = ?").bind(brief.box_key).run();
  return true;
}

// ---------- Held for review (2026-11-23, AbelZeta) ----------
// An AI talking point that fails the quality check (no website read, ICP unknown, person = job title,
// too few angles…) is never sent to the client team. Olivier gets it ONCE per lead, internal version,
// with what is missing, so he can complete Streak (website, work email) and have it rebuilt.
// Logged in send_log with status 'held' — it does not count as sent, so a rebuilt brief that passes
// still goes to the client.
export const REVIEW_TO = ['olivier@gershonconsulting.com'];

export async function holdForReview(env, clientRow, brief) {
  const done = await env.DB.prepare("SELECT 1 FROM send_log WHERE box_key = ? AND status = 'held'").bind(brief.box_key).first();
  if (done) return false;
  const missing = brief.data?.quality?.missing || [];
  const data = {
    ...brief.data,
    header: {
      ...(brief.data?.header || {}),
      alert: { title: 'Held — NOT sent to the client.', text: `Missing: ${missing.join(', ') || 'see below'}. Fix the lead in Streak (website / work email), then rebuild it in Admin.` },
    },
  };
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
  const who = { client_id: clientRow.id, box_key: brief.box_key, company: brief.company, lead_name: brief.lead_name, sent_by: 'held for review', to: REVIEW_TO };
  try {
    await sendEmail(env, {
      to: REVIEW_TO,
      from: 'GC Talking Points <talkingpoints@gershon.ai>',
      subject: `[Held — not sent to client] ${briefSubject(clientRow.name, brief.company, brief.lead_name, date)}`,
      html: renderBrief(data),
      text: renderBriefText(data),
      idempotencyKey: `held-${brief.box_key}`,
    });
  } catch (e) { await logSend(env, { ...who, status: 'failed', error: e.message || e }); throw e; }
  await logSend(env, { ...who, status: 'held' });
  return true;
}
