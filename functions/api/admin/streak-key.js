import { json, streak, encryptText, gershonStreakKey } from '../../_lib.js';

// Owner only (enforced in functions/_middleware.js).
// GET  /api/admin/streak-key → { connected, hint, pipelines }   (the key itself is never returned)
// POST /api/admin/streak-key { key } → validate with Streak, then store encrypted
export async function onRequestGet({ env }) {
  const key = await gershonStreakKey(env);
  if (!key) return json({ connected: false });
  let pipelines = 0;
  try { const list = await streak(key, '/v1/pipelines'); pipelines = Array.isArray(list) ? list.length : 0; } catch { pipelines = -1; }
  return json({ connected: true, hint: key.slice(-4), pipelines, from_secret: !!env.STREAK_API_KEY });
}

export async function onRequestPost({ request, env }) {
  const b = await request.json().catch(() => ({}));
  const k = String(b.key || '').trim();
  if (!k) return json({ error: 'Paste the Streak API key.' }, 400);
  let list;
  try { list = await streak(k, '/v1/pipelines'); } catch { return json({ error: 'Streak refused this key. Copy it again from Streak → Integrations → API key.' }, 400); }
  await env.DB.prepare("INSERT INTO app_secrets (name, value) VALUES ('GERSHON_STREAK_KEY_ENC', ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value")
    .bind(await encryptText(env, k)).run();
  return json({ ok: true, pipelines: Array.isArray(list) ? list.length : 0 });
}
