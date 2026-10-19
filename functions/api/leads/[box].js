import { currentUser, json, rowToBrief } from '../../_lib.js';
import { buildDraft } from '../../_brief.js';
import { renderBrief } from '../../_render.js';

// GET  /api/leads/:box → stored brief + rendered HTML
// POST /api/leads/:box → build a draft now (no email)
export async function onRequestGet({ request, env, params }) {
  const box = decodeURIComponent(params.box);
  const u = await currentUser(env, request);
  if (!u) return json({ error: 'signed_out' }, 401);
  const row = rowToBrief(await env.DB.prepare('SELECT * FROM briefs WHERE box_key = ? AND client_id = ?').bind(box, u.client_id).first());
  return json({ brief: row ? { ...row, html: renderBrief(row.data) } : null });
}

export async function onRequestPost({ request, env, params }) {
  const box = decodeURIComponent(params.box);
  const u = await currentUser(env, request);
  if (!u) return json({ error: 'signed_out' }, 401);
  const client = await env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(u.client_id).first();
  try {
    const brief = await buildDraft(env, client, box);
    if (!brief || brief.client_id !== u.client_id) return json({ error: 'not_found' }, 404);
    return json({ brief: { ...brief, html: renderBrief(brief.data) } });
  } catch (e) {
    return json({ error: 'generate_failed', detail: String(e.message || e) }, 502);
  }
}
