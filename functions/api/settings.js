import { pipelineKeyFrom, currentUser, json, streak, getSettings, encryptText, decryptText, clientStreakKey } from '../_lib.js';
import { googleAccessToken, listCalendars } from '../_google.js';

// GET /api/settings → the client's settings (secrets never returned)
// PUT /api/settings → update (members with can_manage, or Gershon admins)
export async function onRequestGet({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return json({ error: 'signed_out' }, 401);
  const s = (await getSettings(env, u.client_id)) || {};

  // Only the client's own key lists pipelines. Gershon's shared key is shown to Gershon admins only,
  // so a client never sees (or picks) another client's pipeline.
  const ownKey = await decryptText(env, s.streak_key_enc);
  const key = ownKey || (u.is_admin ? await clientStreakKey(env, u.client_id) : '');
  let pipelines = [];
  if (key) {
    try {
      const list = await streak(key, '/v1/pipelines');
      pipelines = (Array.isArray(list) ? list : []).map((p) => ({ key: p.pipelineKey || p.key, name: p.name })).sort((a, b) => a.name.localeCompare(b.name));
    } catch { pipelines = []; }
  }

  let calendars = [];
  if (s.google_refresh_enc) {
    const token = await googleAccessToken(env, s);
    if (token) calendars = await listCalendars(token);
  }

  return json({
    can_manage: !!(u.can_manage || u.is_admin),
    streak: { connected: !!s.streak_key_enc, hint: s.streak_key_hint || '', pipeline_key: u.pipeline_key || '', pipelines, valid: !!key && pipelines.length > 0 },
    recipients: s.recipients || '',
    lead_hours: s.lead_hours || 48,
    calendar: {
      available: !!env.GOOGLE_CLIENT_ID,
      connected: !!s.google_refresh_enc,
      email: s.google_email || '',
      calendar_id: s.calendar_id || 'primary',
      calendars,
    },
    ai: 'Cloudflare Workers AI',
  });
}

export async function onRequestPut({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return json({ error: 'signed_out' }, 401);
  const b = await request.json().catch(() => ({}));
  // Everyone on the client's team may choose who receives the talking points; the rest needs a manager.
  const onlyRecipients = Object.keys(b).every((k) => k === 'recipients');
  if (!onlyRecipients && !u.can_manage && !u.is_admin) return json({ error: 'Only your account manager can change settings.' }, 403);

  await env.DB.prepare('INSERT OR IGNORE INTO client_settings (client_id) VALUES (?)').bind(u.client_id).run();

  // Streak API key: validate before saving
  if (typeof b.streak_key === 'string' && b.streak_key.trim()) {
    const k = b.streak_key.trim();
    try { await streak(k, '/v1/pipelines'); } catch { return json({ error: 'Streak refused this API key. Copy it again from Streak → Integrations → API key.' }, 400); }
    await env.DB.prepare("UPDATE client_settings SET streak_key_enc = ?, streak_key_hint = ?, updated_at = datetime('now') WHERE client_id = ?")
      .bind(await encryptText(env, k), k.slice(-4), u.client_id).run();
  }
  if (b.remove_streak) {
    await env.DB.prepare("UPDATE client_settings SET streak_key_enc = '', streak_key_hint = '' WHERE client_id = ?").bind(u.client_id).run();
  }
  if (typeof b.pipeline_key === 'string') {
    const pk = pipelineKeyFrom(b.pipeline_key);
    if (pk && !u.is_admin) {
      const s2 = (await getSettings(env, u.client_id)) || {};
      const own = await decryptText(env, s2.streak_key_enc);
      let ok = false;
      try { const list = await streak(own, '/v1/pipelines'); ok = (Array.isArray(list) ? list : []).some((p) => (p.pipelineKey || p.key) === pk); } catch { ok = false; }
      if (!ok) return json({ error: 'Choose a pipeline from your own Streak account.' }, 400);
    }
    await env.DB.prepare('UPDATE clients SET pipeline_key = ? WHERE id = ?').bind(pk, u.client_id).run();
  }
  if (typeof b.recipients === 'string') {
    const list = b.recipients.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
    const bad = list.filter((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
    if (bad.length) return json({ error: `Check these email addresses: ${bad.join(', ')}` }, 400);
    await env.DB.prepare('UPDATE client_settings SET recipients = ? WHERE client_id = ?').bind(list.join(', '), u.client_id).run();
  }
  if (b.lead_hours !== undefined) {
    const h = Math.max(1, Math.min(168, parseInt(b.lead_hours, 10) || 48));
    await env.DB.prepare('UPDATE client_settings SET lead_hours = ? WHERE client_id = ?').bind(h, u.client_id).run();
  }
  if (typeof b.calendar_id === 'string' && b.calendar_id) {
    await env.DB.prepare('UPDATE client_settings SET calendar_id = ? WHERE client_id = ?').bind(b.calendar_id, u.client_id).run();
  }
  if (b.disconnect_google) {
    await env.DB.prepare("UPDATE client_settings SET google_refresh_enc = '', google_email = '', calendar_id = 'primary' WHERE client_id = ?").bind(u.client_id).run();
  }
  return json({ ok: true });
}
