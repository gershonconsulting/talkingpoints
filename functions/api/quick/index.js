import { currentUser, json } from '../../_lib.js';
import { renderBrief } from '../../_render.js';
import { getTemplate, applyTemplate } from '../../_template.js';
import { parseInput, readWebsite, buildQuickBrief } from '../../_quick.js';

const DAILY_LIMIT = 40; // quick talking points per client per day (Workers AI cost guard)

// GET  /api/quick → the campaign's last 30 quick talking points
// POST /api/quick { input: "https://acme.com" | "jane.doe@acme.com" } → builds one now (Workers AI)
export async function onRequestGet({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return json({ error: 'signed_out' }, 401);
  const rows = (await env.DB.prepare(
    'SELECT id, input, kind, domain, company, lead_name, lead_role, created_by, created_at FROM quick_briefs WHERE client_id = ? ORDER BY id DESC LIMIT 30'
  ).bind(u.client_id).all()).results || [];
  return json({ items: rows });
}

export async function onRequestPost({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return json({ error: 'signed_out' }, 401);
  const b = await request.json().catch(() => ({}));
  const target = parseInput(b.input);
  if (target.error) return json({ error: target.error }, 400);
  if (!env.AI) return json({ error: 'Cloudflare AI is not available on this deployment.' }, 503);

  const used = await env.DB.prepare("SELECT COUNT(*) AS n FROM quick_briefs WHERE client_id = ? AND created_at > datetime('now', '-1 day')").bind(u.client_id).first();
  if ((used?.n || 0) >= DAILY_LIMIT) return json({ error: `Limit reached: ${DAILY_LIMIT} quick talking points a day. Try again tomorrow.` }, 429);

  const tpl = await getTemplate(env, u.client_id);
  const team = (await env.DB.prepare('SELECT name, title, background FROM members WHERE client_id = ? AND is_admin = 0').bind(u.client_id).all()).results || [];
  const site = await readWebsite(target);
  let data;
  try {
    data = await buildQuickBrief(env, { target, site, clientName: u.client_name, company: tpl.company, icp: tpl.icp, team });
  } catch (e) {
    return json({ error: 'Cloudflare AI could not write the talking point. Try again in a minute.', detail: String(e.message || e) }, 502);
  }
  const r = await env.DB.prepare(
    'INSERT INTO quick_briefs (client_id, input, kind, domain, company, lead_name, lead_role, data, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(u.client_id, String(b.input).trim().slice(0, 300), target.kind, target.domain, data.header.company || '', data.header.person || '', data.header.role || '', JSON.stringify(data), u.email).run();
  const id = r.meta?.last_row_id;
  return json({
    brief: { id, box_key: `quick:${id}`, company: data.header.company, lead_name: data.header.person, lead_role: data.header.role, quick: true, html: renderBrief(applyTemplate(data, tpl)) },
  });
}
