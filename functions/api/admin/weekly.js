import { json } from '../../_lib.js';
import { lastLeads, NEW_LEAD_DAYS, nyParts } from '../../_weekly.js';

// Owner only (functions/_middleware.js).
// GET /api/admin/weekly → for every client, its new Streak leads (last NEW_LEAD_DAYS days) and each one's Friday status:
//   'sent' (already emailed once — never again), 'ready to send' (researched, goes out Friday),
//   'research needed' (no researched talking point yet).
export async function onRequestGet({ env }) {
  const clients = (await env.DB.prepare('SELECT * FROM clients ORDER BY name').all()).results;
  const out = [];
  for (const c of clients) {
    try {
      const { connected, leads } = await lastLeads(env, c);
      out.push({ id: c.id, slug: c.slug, name: c.name, connected, leads: leads.map(({ brief, ...l }) => l) });
    } catch (e) { out.push({ id: c.id, slug: c.slug, name: c.name, connected: false, error: e.message || String(e), leads: [] }); }
  }
  return json({ days: NEW_LEAD_DAYS, now: nyParts(), clients: out });
}
