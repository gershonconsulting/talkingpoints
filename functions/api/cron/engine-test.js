import { json, sendEmail } from '../../_lib.js';
import { buildAutoBrief } from '../../_auto.js';
import { applyTemplate, getTemplate } from '../../_template.js';
import { renderBrief, renderBriefText } from '../../_render.js';
import { briefSubject, FROM_INTERNAL } from '../../_audience.js';

// POST /api/cron/engine-test (Bearer INGEST_TOKEN or the repo's GitHub OIDC token, see _middleware.js)
// { client: <slug>, box_key, email?: true } — builds the talking point for one Streak lead with the
// current engine WITHOUT saving it (nothing in D1 or send_log) and returns its quality, research stats
// and full JSON. With email: true the internal version also goes to olivier@gershonconsulting.com only.
// Used by .github/workflows/engine-test.yml to check the engine on real leads after a deploy.
export const TEST_TO = 'olivier@gershonconsulting.com';

export async function onRequestPost({ request, env }) {
  if (!env.INGEST_TOKEN || request.headers.get('authorization') !== `Bearer ${env.INGEST_TOKEN}`) return json({ error: 'forbidden' }, 403);
  const b = await request.json().catch(() => null);
  if (!b?.client || !b?.box_key) return json({ error: 'client and box_key are required' }, 400);
  const client = await env.DB.prepare('SELECT * FROM clients WHERE slug = ?').bind(b.client).first();
  if (!client) return json({ error: `unknown client "${b.client}"` }, 404);
  const t0 = Date.now();
  let brief;
  try { brief = await buildAutoBrief(env, client, b.box_key, { save: false }); }
  catch (e) { return json({ error: e.message || String(e) }, /wrong_client/.test(e.message) ? 409 : 500); }
  const data = applyTemplate(brief.data, await getTemplate(env, client.id));
  let emailed = false;
  if (b.email) {
    const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
    await sendEmail(env, { to: [TEST_TO], from: FROM_INTERNAL, subject: `TEST engine v${b.version || ''} (not sent to client) — ${briefSubject(client.name, brief.company, brief.lead_name, date)}`, html: renderBrief(data), text: renderBriefText(data) });
    emailed = true;
  }
  return json({ ok: true, ms: Date.now() - t0, emailed, company: brief.company, lead: brief.lead_name, quality: data.quality, stats: data.research_stats, grade: data.grade, data });
}
