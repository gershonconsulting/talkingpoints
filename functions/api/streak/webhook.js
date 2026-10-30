import { json } from '../../_lib.js';

// POST /api/streak/webhook?token=…  — registered on each "<Client> - LG" pipeline for BOX_CREATE.
export async function onRequestPost({ request, env, waitUntil }) {
  const url = new URL(request.url);
  if (url.searchParams.get('token') !== env.WEBHOOK_TOKEN) return json({ error: 'forbidden' }, 403);

  const payload = await request.json().catch(() => ({}));
  const box = payload.box || payload.data || payload;
  const boxKey = box.boxKey || box.key;
  const pipelineKey = box.pipelineKey;
  if (!boxKey || !pipelineKey) return json({ ok: true, skipped: 'no box' });

  const client = await env.DB.prepare('SELECT * FROM clients WHERE pipeline_key = ?').bind(pipelineKey).first();
  if (!client) return json({ ok: true, skipped: 'pipeline not linked to a client' });

  // Talking points are created once a day by /api/cron/run (first run after 7 am New York time),
  // so a new box is only acknowledged here.
  return json({ ok: true, queued_for_daily_run: boxKey, client: client.slug });
}
