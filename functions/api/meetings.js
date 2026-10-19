import { currentUser, json } from '../_lib.js';

// GET /api/meetings → upcoming meetings we prepared talking points for
export async function onRequestGet({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return json({ error: 'signed_out' }, 401);
  const rows = (await env.DB.prepare(
    `SELECT m.event_id, m.box_key, m.title, m.attendee, m.starts_at, m.sent_at, b.company, b.lead_name
       FROM meetings m LEFT JOIN briefs b ON b.box_key = m.box_key
      WHERE m.client_id = ? AND m.starts_at > datetime('now', '-2 hours')
      ORDER BY m.starts_at LIMIT 20`
  ).bind(u.client_id).all()).results;
  return json({ meetings: rows });
}
