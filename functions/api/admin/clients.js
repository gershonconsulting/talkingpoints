import { json, currentUser } from '../../_lib.js';

// Owner only (enforced in functions/_middleware.js).
// GET  /api/admin/clients → every client with its members and status
// POST /api/admin/clients { name, slug, pipeline_key, email_domains } → create or update a client
export async function onRequestGet({ request, env }) {
  const me = await currentUser(env, request);
  const clients = (await env.DB.prepare(
    `SELECT c.*, s.streak_key_hint, s.google_email, s.recipients,
            (SELECT COUNT(*) FROM briefs b WHERE b.client_id = c.id) AS briefs
       FROM clients c LEFT JOIN client_settings s ON s.client_id = c.id ORDER BY c.name`
  ).all()).results;
  const members = (await env.DB.prepare(
    'SELECT id, client_id, email, name, title, is_admin, can_manage, notify, last_login_at FROM members ORDER BY name'
  ).all()).results;
  return json({
    viewing: me?.client_id || null,
    clients: clients.map((c) => ({
      ...c,
      streak_connected: !!c.streak_key_hint,
      streak_url: c.pipeline_key && !c.pipeline_key.startsWith('pipeline:') ? `https://www.streak.com/a/pipelines/${c.pipeline_key}` : '',
      members: members.filter((m) => m.client_id === c.id),
    })),
  });
}

export async function onRequestPost({ request, env }) {
  const b = await request.json().catch(() => ({}));
  const name = String(b.name || '').trim();
  const slug = String(b.slug || name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!name || !slug) return json({ error: 'Give the client a name.' }, 400);
  const domains = String(b.email_domains || '').split(/[\s,;]+/).map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean).join(',');
  await env.DB.prepare(
    `INSERT INTO clients (slug, name, pipeline_key, email_domains) VALUES (?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET name = excluded.name, pipeline_key = excluded.pipeline_key, email_domains = excluded.email_domains`
  ).bind(slug, name, String(b.pipeline_key || '').trim(), domains).run();
  const c = await env.DB.prepare('SELECT id FROM clients WHERE slug = ?').bind(slug).first();
  await env.DB.prepare('INSERT OR IGNORE INTO client_settings (client_id) VALUES (?)').bind(c.id).run();
  return json({ ok: true, id: c.id, slug });
}
