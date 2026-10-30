import { json, currentUser, pipelineKeyFrom } from '../../_lib.js';
import { saveTemplate } from '../../_template.js';
import { emailsIn } from '../../_sources.js';

// Owner only (enforced in functions/_middleware.js).
// GET  /api/admin/clients → every client with its members and status
// POST /api/admin/clients → create or update a client in one go (2026-10-30):
//   { name, no, pipeline_key, email_domains,
//     contact_name, email (professional), login_email (LinkedIn sign-in),
//     recipients (who receives the talking points), company, icp (from ICP.gershon.ai or typed) }
export async function onRequestGet({ request, env }) {
  const me = await currentUser(env, request);
  const clients = (await env.DB.prepare(
    `SELECT c.*, s.streak_key_hint, s.google_email, s.recipients,
            (SELECT COUNT(*) FROM briefs b WHERE b.client_id = c.id) AS briefs
       FROM clients c LEFT JOIN client_settings s ON s.client_id = c.id ORDER BY c.name`
  ).all()).results;
  const members = (await env.DB.prepare(
    'SELECT id, client_id, email, login_email, name, title, is_admin, can_manage, notify, last_login_at FROM members ORDER BY name'
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

const isEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

export async function onRequestPost({ request, env }) {
  const b = await request.json().catch(() => ({}));
  const base = String(b.name || '').trim().replace(/^#\d+\s*/, '');
  const no = String(b.no || '').replace(/\D/g, '');
  if (!base) return json({ error: 'Give the client a company name.' }, 400);
  const name = no ? `#${no} ${base}` : base;
  const slug = String(b.slug || base).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const email = String(b.email || '').trim().toLowerCase();
  const login = String(b.login_email || '').trim().toLowerCase();
  if (email && !isEmail(email)) return json({ error: 'Check the professional email.' }, 400);
  if (login && !isEmail(login)) return json({ error: 'Check the LinkedIn login email.' }, 400);
  const recipients = emailsIn(b.recipients);
  const domains = String(b.email_domains || '').split(/[\s,;]+/).map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean).join(',');

  await env.DB.prepare(
    `INSERT INTO clients (slug, name, pipeline_key, email_domains) VALUES (?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET name = excluded.name, pipeline_key = excluded.pipeline_key, email_domains = excluded.email_domains`
  ).bind(slug, name, pipelineKeyFrom(b.pipeline_key), domains).run();
  const c = await env.DB.prepare('SELECT id FROM clients WHERE slug = ?').bind(slug).first();
  await env.DB.prepare('INSERT OR IGNORE INTO client_settings (client_id) VALUES (?)').bind(c.id).run();
  if (recipients.length) await env.DB.prepare('UPDATE client_settings SET recipients = ? WHERE client_id = ?').bind(recipients.join(', '), c.id).run();

  // The client's main person: professional email = reports, LinkedIn email = sign-in. Can manage Settings.
  if (email) {
    await env.DB.prepare(
      `INSERT INTO members (client_id, email, login_email, name, title, can_manage, notify) VALUES (?, ?, ?, ?, ?, 1, 0)
       ON CONFLICT(email) DO UPDATE SET client_id = excluded.client_id,
         login_email = COALESCE(excluded.login_email, members.login_email),
         name = COALESCE(NULLIF(excluded.name, ''), members.name),
         title = COALESCE(NULLIF(excluded.title, ''), members.title), can_manage = 1`
    ).bind(c.id, email, login && login !== email ? login : null, String(b.contact_name || '').trim(), String(b.contact_title || '').trim()).run();
  }
  if (String(b.company || '').trim() || String(b.icp || '').trim()) {
    await saveTemplate(env, c.id, { company: String(b.company || ''), icp: String(b.icp || '') });
  }
  return json({ ok: true, id: c.id, slug, name, recipients: recipients.length, member: !!email });
}
