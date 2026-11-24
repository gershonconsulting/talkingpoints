import { json } from '../../_lib.js';
import { buildAutoBrief } from '../../_auto.js';
import { lastLeads } from '../../_weekly.js';

// Owner only (functions/_middleware.js).
// POST /api/admin/rebuild { client: <slug>, box_key? } — rebuilds with the Cloudflare AI engine the talking
// points of the client's new leads NOT sent yet (or one lead), so they all use the current engine
// (client knowledge base, Streak conversation, quality check — 2026-11-20). Never emails: the app's
// runs send them. Returns each lead's quality check.
export async function onRequestPost({ request, env }) {
  const b = await request.json().catch(() => ({}));
  if (!b.client) return json({ error: 'client is required' }, 400);
  const client = await env.DB.prepare('SELECT * FROM clients WHERE slug = ?').bind(b.client).first();
  if (!client) return json({ error: `unknown client "${b.client}"` }, 404);
  const { connected, leads } = await lastLeads(env, client);
  if (!connected) return json({ error: 'Streak not connected' }, 409);
  // { box_key, force: true } also rebuilds a lead already sent (2026-11-23: AbelZeta re-sent after the engine fix).
  const todo = leads.filter((l) => (!l.sent_at || (b.box_key && b.force)) && (!b.box_key || l.box_key === b.box_key)).slice(0, Number(b.limit) || 6);
  const out = [];
  for (const l of todo) {
    try {
      const brief = await buildAutoBrief(env, client, l.box_key);
      out.push({ lead: l.name, ok: !!brief.data?.quality?.ok, website: brief.data?.header?.source_line || '', website_from: brief.data?.website_from || '', missing: brief.data?.quality?.missing || [], sections: Object.keys(brief.data || {}).filter((k) => brief.data[k]) });
    } catch (e) { out.push({ lead: l.name, error: e.message || String(e) }); }
  }
  return json({ ok: true, client: client.slug, rebuilt: out });
}
