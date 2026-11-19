import { json } from '../../_lib.js';
import { sendEmail } from '../../_lib.js';
import { buildAutoBrief } from '../../_auto.js';
import { planBriefEmail, briefSubject } from '../../_audience.js';
import { applyTemplate, getTemplate } from '../../_template.js';
import { renderBrief, renderBriefText } from '../../_render.js';

// Owner only (functions/_middleware.js). Test of the Cloudflare AI talking point (Olivier, 2026-11-19,
// "3" = test first): POST { client: <slug>, box_key, view: "client"|"internal" } builds the talking
// point for that Streak lead WITHOUT saving it (nothing in D1, nothing in send_log, so the lead is
// still "new" for the real runs) and emails it ONLY to olivier@gershonconsulting.com.
// view "client" (default) shows exactly what the client team would receive.
export const TEST_TO = 'olivier@gershonconsulting.com';

export async function onRequestPost({ request, env }) {
  const b = await request.json().catch(() => null);
  if (!b?.client || !b?.box_key) return json({ error: 'client and box_key are required' }, 400);
  const client = await env.DB.prepare('SELECT * FROM clients WHERE slug = ?').bind(b.client).first();
  if (!client) return json({ error: `unknown client "${b.client}"` }, 404);
  let brief;
  try { brief = await buildAutoBrief(env, client, b.box_key, { save: false }); }
  catch (e) { return json({ error: e.message || String(e) }, /wrong_client/.test(e.message) ? 409 : 500); }
  const data = applyTemplate(brief.data, await getTemplate(env, client.id));
  // Client view: plan as if a client address were on the list, but send to Olivier only.
  const plan = planBriefEmail(b.view === 'internal' ? [TEST_TO] : ['client@example.com', TEST_TO], data);
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
  await sendEmail(env, {
    to: [TEST_TO],
    from: plan.from,
    subject: `TEST (Cloudflare AI, not sent to client) — ${briefSubject(client.name, brief.company, brief.lead_name, date)}`,
    html: renderBrief(plan.data),
    text: renderBriefText(plan.data),
  });
  return json({ ok: true, to: TEST_TO, company: brief.company, lead: brief.lead_name, sections: Object.keys(plan.data).filter((k) => plan.data[k]) });
}
