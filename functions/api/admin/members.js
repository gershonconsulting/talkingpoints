import { json, OWNER_EMAILS } from '../../_lib.js';

// Owner only (enforced in functions/_middleware.js).
// POST   /api/admin/members { client_id, email, name, title, can_manage } → invite (or update) a person
// DELETE /api/admin/members { id } → remove a person and sign them out
export async function onRequestPost({ request, env }) {
  const b = await request.json().catch(() => ({}));
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Check the email address.' }, 400);
  const client = await env.DB.prepare('SELECT id FROM clients WHERE id = ?').bind(Number(b.client_id)).first();
  if (!client) return json({ error: 'Pick a client.' }, 400);
  await env.DB.prepare(
    `INSERT INTO members (client_id, email, name, title, can_manage) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET client_id = excluded.client_id, name = excluded.name,
       title = excluded.title, can_manage = excluded.can_manage`
  ).bind(client.id, email, String(b.name || '').trim(), String(b.title || '').trim(), b.can_manage ? 1 : 0).run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const b = await request.json().catch(() => ({}));
  const m = await env.DB.prepare('SELECT id, email FROM members WHERE id = ?').bind(Number(b.id)).first();
  if (!m) return json({ error: 'Not found.' }, 404);
  if (OWNER_EMAILS.includes(m.email.toLowerCase())) return json({ error: 'The owner account cannot be removed.' }, 400);
  await env.DB.prepare('DELETE FROM sessions WHERE member_id = ?').bind(m.id).run();
  await env.DB.prepare('DELETE FROM members WHERE id = ?').bind(m.id).run();
  return json({ ok: true });
}
