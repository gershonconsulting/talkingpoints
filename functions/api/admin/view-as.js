import { json, currentUser } from '../../_lib.js';

// Owner only (enforced in functions/_middleware.js).
// POST /api/admin/view-as { client_id } → the owner's dashboard now shows that campaign
// (its Streak pipeline, leads and briefs), so each campaign can be tested from one account.
export async function onRequestPost({ request, env }) {
  const u = await currentUser(env, request);
  const b = await request.json().catch(() => ({}));
  const c = await env.DB.prepare('SELECT id, name FROM clients WHERE id = ?').bind(Number(b.client_id)).first();
  if (!c) return json({ error: 'Pick a campaign.' }, 400);
  await env.DB.prepare('UPDATE members SET client_id = ? WHERE id = ?').bind(c.id, u.id).run();
  return json({ ok: true, client: c });
}
