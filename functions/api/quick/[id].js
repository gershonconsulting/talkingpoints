import { currentUser, json } from '../../_lib.js';
import { renderBrief } from '../../_render.js';
import { getTemplate, applyTemplate } from '../../_template.js';

// GET    /api/quick/:id → one quick talking point + rendered HTML
// DELETE /api/quick/:id → removes it
export async function loadQuick(env, u, id) {
  const row = await env.DB.prepare('SELECT * FROM quick_briefs WHERE id = ? AND client_id = ?').bind(Number(id) || 0, u.client_id).first();
  if (!row) return null;
  let data = {};
  try { data = JSON.parse(row.data || '{}'); } catch { data = {}; }
  return { ...row, data };
}

export async function onRequestGet({ request, env, params }) {
  const u = await currentUser(env, request);
  if (!u) return json({ error: 'signed_out' }, 401);
  const q = await loadQuick(env, u, params.id);
  if (!q) return json({ error: 'not_found' }, 404);
  const tpl = await getTemplate(env, u.client_id);
  return json({ brief: { id: q.id, box_key: `quick:${q.id}`, company: q.company, lead_name: q.lead_name, lead_role: q.lead_role, quick: true, html: renderBrief(applyTemplate(q.data, tpl)) } });
}

export async function onRequestDelete({ request, env, params }) {
  const u = await currentUser(env, request);
  if (!u) return json({ error: 'signed_out' }, 401);
  await env.DB.prepare('DELETE FROM quick_briefs WHERE id = ? AND client_id = ?').bind(Number(params.id) || 0, u.client_id).run();
  return json({ ok: true });
}
