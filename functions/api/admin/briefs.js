import { json, streak, clientStreakKey } from '../../_lib.js';
import { saveBrief, samePipeline } from '../../_brief.js';

// Owner only (functions/_middleware.js).
// POST /api/admin/briefs — publish a researched talking point straight from the owner's session
// (same body as /api/briefs: { client, box_key, company, lead_name, lead_role, stage, data }).
// Never emails: the Friday run or a manual Send does that. Refuses a lead that is not in the
// client's own Streak pipeline (no talking point filed under the wrong client — 2026-10-30).
export async function onRequestPost({ request, env }) {
  const b = await request.json().catch(() => null);
  if (!b?.client || !b?.box_key || !b?.data) return json({ error: 'client, box_key and data are required' }, 400);
  const client = await env.DB.prepare('SELECT * FROM clients WHERE slug = ?').bind(b.client).first();
  if (!client) return json({ error: `unknown client "${b.client}"` }, 404);
  const key = await clientStreakKey(env, client.id);
  const box = await streak(key, `/v1/boxes/${b.box_key}`).catch(() => null);
  if (!box) return json({ error: 'Streak box not found' }, 404);
  if (!samePipeline(box.pipelineKey, client.pipeline_key)) return json({ error: `This lead is not in ${client.name}'s Streak pipeline.` }, 409);
  const brief = await saveBrief(env, client.id, b.box_key, {
    company: b.company || b.data.header?.company,
    lead_name: b.lead_name || b.data.header?.person,
    lead_role: b.lead_role || b.data.header?.role,
    stage: b.stage || '',
    status: 'ready',
    data: b.data,
  });
  return json({ ok: true, box_key: brief.box_key, status: brief.status });
}
