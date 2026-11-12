import { currentUser, json, sendEmail, getSettings, logSend } from '../../../_lib.js';
import { renderBrief, renderBriefText } from '../../../_render.js';
import { getTemplate, applyTemplate } from '../../../_template.js';
import { planBriefEmail, briefSubject } from '../../../_audience.js';
import { loadQuick } from '../[id].js';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// GET  /api/quick/:id/send → suggested recipients + send log
// POST /api/quick/:id/send { to, note } → emails this quick talking point (same rules as lead briefs)
export async function onRequestGet({ request, env, params }) {
  const u = await currentUser(env, request);
  if (!u) return json({ error: 'signed_out' }, 401);
  const s = (await getSettings(env, u.client_id)) || {};
  const list = String(s.recipients || '').split(/[\s,;]+/).filter((e) => EMAIL.test(e));
  const history = (await env.DB.prepare(
    'SELECT sent_by, to_list, status, error, created_at FROM send_log WHERE box_key = ? AND client_id = ? ORDER BY id DESC LIMIT 20'
  ).bind(`quick:${Number(params.id) || 0}`, u.client_id).all()).results || [];
  return json({ suggested: [...new Set([u.email, ...list])].join(', '), ready: true, history });
}

export async function onRequestPost({ request, env, params }) {
  const u = await currentUser(env, request);
  if (!u) return json({ error: 'signed_out' }, 401);
  const q = await loadQuick(env, u, params.id);
  if (!q) return json({ error: 'This quick talking point no longer exists.' }, 404);
  const b = await request.json().catch(() => ({}));
  const to = [...new Set(String(b.to || '').split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const bad = to.filter((e) => !EMAIL.test(e));
  if (!to.length || bad.length) return json({ error: bad.length ? `Check these addresses: ${bad.join(', ')}` : 'Add at least one email address.' }, 400);
  if (to.length > 20) return json({ error: 'Send to 20 people at most.' }, 400);

  const plan = planBriefEmail(to, applyTemplate(q.data, await getTemplate(env, u.client_id)));
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
  const note = String(b.note || '').trim().slice(0, 1000);
  const esc = (x) => x.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const intro = note ? `<div style="max-width:680px;margin:0 auto 12px;font-family:Arial,sans-serif;font-size:14px;color:#33475b;line-height:1.6;">${esc(note).replace(/\n/g, '<br>')}<br><br>— ${esc(u.name || u.email)}</div>` : '';
  const box = `quick:${q.id}`;
  try {
    await sendEmail(env, {
      to, from: plan.from, reply_to: EMAIL.test(u.email || '') ? u.email : undefined,
      subject: briefSubject(q.company, q.lead_name || 'Quick talking point', date),
      html: intro + renderBrief(plan.data),
      text: (note ? `${note}\n\n` : '') + renderBriefText(plan.data),
    });
  } catch (e) {
    await logSend(env, { client_id: u.client_id, box_key: box, company: q.company, lead_name: q.lead_name, sent_by: u.email, to, status: 'failed', error: e.message || e });
    return json({ error: 'The email could not be sent. Try again in a minute.', detail: String(e.message || e) }, 502);
  }
  await logSend(env, { client_id: u.client_id, box_key: box, company: q.company, lead_name: q.lead_name, sent_by: u.email, to });
  return json({ ok: true, sent_to: to });
}
