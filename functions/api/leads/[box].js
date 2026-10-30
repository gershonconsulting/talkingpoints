import { currentUser, json, rowToBrief } from '../../_lib.js';
import { renderBrief } from '../../_render.js';
import { getTemplate, applyTemplate } from '../../_template.js';

// GET  /api/leads/:box → stored brief + rendered HTML
// POST /api/leads/:box → build a draft now (no email)
export async function onRequestGet({ request, env, params }) {
  const box = decodeURIComponent(params.box);
  const u = await currentUser(env, request);
  if (!u) return json({ error: 'signed_out' }, 401);
  const row = rowToBrief(await env.DB.prepare("SELECT * FROM briefs WHERE box_key = ? AND client_id = ? AND status = 'ready'").bind(box, u.client_id).first());
  const tpl = await getTemplate(env, u.client_id);
  return json({ brief: row ? { ...row, html: renderBrief(applyTemplate(row.data, tpl)) } : null });
}

// Quick AI drafts are switched off (Olivier, 2026-10-30): only fully researched briefs are shown or sent.
export async function onRequestPost() {
  return json({ error: 'drafts_disabled', detail: 'Talking points are researched by Gershon and appear here when ready.' }, 410);
}
