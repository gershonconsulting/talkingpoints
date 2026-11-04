import { currentUser, json, streak, rowToBrief, clientStreakKey, scheduledOnly, scheduledBoxes } from '../../_lib.js';

// GET /api/leads → newest leads in the client's Streak pipeline, with brief status
export async function onRequestGet({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return json({ error: 'signed_out' }, 401);

  const key = await clientStreakKey(env, u.client_id);
  // Gershon's own pipelines list only the leads with a call scheduled (2026-11-03).
  const onlyScheduled = scheduledOnly(u);
  const sched = onlyScheduled ? await scheduledBoxes(key, u.pipeline_key).catch(() => ({ pipeline: { stages: {} }, boxes: [] })) : null;
  const [boxes, pipeline, briefs] = await Promise.all([
    sched ? sched.boxes : streak(key, `/v1/pipelines/${u.pipeline_key}/boxes?sortBy=creationTimestamp&limit=50`).catch(() => []),
    sched ? sched.pipeline : streak(key, `/v1/pipelines/${u.pipeline_key}`).catch(() => ({ stages: {} })),
    env.DB.prepare("SELECT * FROM briefs WHERE client_id = ? AND status = 'ready' ORDER BY created_at DESC").bind(u.client_id).all(),
  ]);

  const summary = (r) => {
    const b = rowToBrief(r);
    return {
      box_key: b.box_key, company: b.company, lead_name: b.lead_name, lead_role: b.lead_role,
      stage: b.stage, status: b.status, created_at: b.created_at,
      best_match: b.data?.in_common?.best_match?.name || '',
    };
  };
  const byBox = Object.fromEntries(briefs.results.map((r) => [r.box_key, summary(r)]));
  const live = (Array.isArray(boxes) ? boxes : [])
    .sort((a, b) => (b.creationTimestamp || 0) - (a.creationTimestamp || 0))
    .map((b) => ({
      box_key: b.boxKey || b.key,
      company: b.name,
      stage: pipeline.stages?.[b.stageKey]?.name || '',
      created: b.creationTimestamp ? new Date(b.creationTimestamp).toISOString() : null,
      brief: byBox[b.boxKey || b.key] || null,
    }));

  // Briefs whose box is not in the live page (older leads) still show up
  const seen = new Set(live.map((l) => l.box_key));
  for (const b of Object.values(byBox)) {
    if (!seen.has(b.box_key)) live.push({ box_key: b.box_key, company: b.company, stage: b.stage, created: b.created_at, brief: b });
  }
  return json({ leads: live, streak_connected: !!key, scheduled_only: onlyScheduled });
}
