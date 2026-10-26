import { json } from '../../_lib.js';

// GET /api/outbox/:id — read by the social.gershon.ai relay. Each queued email can be read
// once, within 10 minutes of being queued; after that it answers 404.
export async function onRequestGet({ env, params }) {
  const id = String(params.id || '');
  if (!/^[a-f0-9]{48}$/.test(id)) return json({ error: 'not_found' }, 404);
  const row = await env.DB.prepare(
    "SELECT * FROM outbox WHERE id = ? AND fetched_at IS NULL AND created_at > datetime('now', '-10 minutes')"
  ).bind(id).first();
  if (!row) return json({ error: 'not_found' }, 404);
  const upd = await env.DB.prepare("UPDATE outbox SET fetched_at = datetime('now') WHERE id = ? AND fetched_at IS NULL").bind(id).run();
  if (!upd.meta?.changes) return json({ error: 'not_found' }, 404);
  let to = [];
  try { to = JSON.parse(row.to_list); } catch { to = []; }
  return json({ to, subject: row.subject, html: row.html, text: row.text, reply_to: row.reply_to }, 200, { 'cache-control': 'no-store' });
}
