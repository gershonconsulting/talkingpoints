import { json } from '../_lib.js';
import { saveBrief, emailBrief } from '../_brief.js';

// POST /api/briefs  (Authorization: Bearer <INGEST_TOKEN>)
// Used by the research step (Gershon team / Claude talking-points run) to publish the full,
// researched brief for a lead. Body:
//   { client: "valos", box_key, company, lead_name, lead_role, stage, data: {…brief JSON…}, send: true|false }
// The brief is stored as "ready" and replaces any draft. With send:true it is emailed (if enabled).
export async function onRequestPost({ request, env }) {
  const auth = request.headers.get('authorization') || '';
  if (!env.INGEST_TOKEN || auth !== `Bearer ${env.INGEST_TOKEN}`) return json({ error: 'forbidden' }, 403);

  const b = await request.json().catch(() => null);
  if (!b?.client || !b?.box_key || !b?.data) return json({ error: 'client, box_key and data are required' }, 400);

  const client = await env.DB.prepare('SELECT * FROM clients WHERE slug = ?').bind(b.client).first();
  if (!client) return json({ error: `unknown client "${b.client}"` }, 404);

  const brief = await saveBrief(env, client.id, b.box_key, {
    company: b.company || b.data.header?.company,
    lead_name: b.lead_name || b.data.header?.person,
    lead_role: b.lead_role || b.data.header?.role,
    stage: b.stage || '',
    status: 'ready',
    data: b.data,
  });
  const emailed = b.send ? await emailBrief(env, client, brief) : false;
  return json({ ok: true, box_key: brief.box_key, status: brief.status, emailed });
}
