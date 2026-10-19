import { json, streak, clientStreakKey } from '../../_lib.js';

// POST /api/admin/webhooks  (Authorization: Bearer <INGEST_TOKEN>)
// Registers the "new box" webhook on every client pipeline that does not have it yet.
// Called by the deploy workflow after each deploy, so adding a client row is enough.
export async function onRequestPost({ request, env }) {
  if (!env.INGEST_TOKEN || request.headers.get('authorization') !== `Bearer ${env.INGEST_TOKEN}`) return json({ error: 'forbidden' }, 403);

  const target = `${env.APP_URL}/api/streak/webhook?token=${encodeURIComponent(env.WEBHOOK_TOKEN)}`;
  const clients = (await env.DB.prepare("SELECT id, slug, pipeline_key FROM clients WHERE pipeline_key != ''").all()).results;
  const report = [];
  for (const c of clients) {
    try {
      const key = await clientStreakKey(env, c.id);
      if (!key) { report.push({ client: c.slug, status: 'Streak not connected yet' }); continue; }
      const existing = await streak(key, `/v2/pipelines/${c.pipeline_key}/webhooks`).catch(() => ({ results: [] }));
      const list = existing.results || existing || [];
      const has = (Array.isArray(list) ? list : []).some((w) => w.event === 'BOX_CREATE' && String(w.targetUrl || '').startsWith(`${env.APP_URL}/api/streak/webhook`));
      if (has) { report.push({ client: c.slug, status: 'already registered' }); continue; }
      await streak(key, `/v2/pipelines/${c.pipeline_key}/webhooks`, {
        method: 'POST',
        body: JSON.stringify({ event: 'BOX_CREATE', targetUrl: target }),
      });
      report.push({ client: c.slug, status: 'registered' });
    } catch (e) {
      report.push({ client: c.slug, status: 'failed', detail: String(e.message || e) });
    }
  }
  return json({ ok: true, report });
}
