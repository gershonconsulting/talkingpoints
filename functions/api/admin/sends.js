import { json } from '../../_lib.js';

// Owner only (enforced in functions/_middleware.js).
// GET /api/admin/sends → the last 100 talking-point emails, every campaign, newest first.
export async function onRequestGet({ env }) {
  const rows = (await env.DB.prepare(
    `SELECT l.created_at, l.status, l.error, l.sent_by, l.to_list, l.company, l.lead_name, c.name AS client
       FROM send_log l LEFT JOIN clients c ON c.id = l.client_id ORDER BY l.id DESC LIMIT 100`
  ).all()).results || [];
  return json({ sends: rows });
}
