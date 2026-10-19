import { currentUser, json } from '../_lib.js';

// GET  /api/me → signed-in member + client
// PUT  /api/me { background, linkedin_url, title, notify } → update own profile
export async function onRequestGet({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return json({ error: 'signed_out' }, 401);
  const team = await env.DB.prepare(
    'SELECT id, name, title, picture, linkedin_url, last_login_at FROM members WHERE client_id = ? AND is_admin = 0 ORDER BY name'
  ).bind(u.client_id).all();
  return json({
    member: {
      id: u.id, name: u.name, email: u.email, title: u.title, picture: u.picture,
      linkedin_url: u.linkedin_url, background: u.background, notify: !!u.notify, is_admin: !!u.is_admin,
    },
    client: { slug: u.client_slug, name: u.client_name },
    team: team.results,
  });
}

export async function onRequestPut({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return json({ error: 'signed_out' }, 401);
  const body = await request.json().catch(() => ({}));
  await env.DB.prepare(
    'UPDATE members SET background = ?, linkedin_url = ?, title = ?, notify = ? WHERE id = ?'
  ).bind(
    String(body.background ?? u.background).slice(0, 6000),
    String(body.linkedin_url ?? u.linkedin_url).slice(0, 300),
    String(body.title ?? u.title).slice(0, 200),
    body.notify === undefined ? u.notify : body.notify ? 1 : 0,
    u.id
  ).run();
  return json({ ok: true });
}
