import { json } from '../../_lib.js';
import { buildFridayReport, REPORT_TO } from '../../_friday_report.js';
import { sendEmail } from '../../_lib.js';
import { nyParts } from '../../_weekly.js';

// Owner only (functions/_middleware.js).
// GET  /api/admin/friday-report?day=YYYY-MM-DD  → preview of that Friday's report (HTML).
// POST /api/admin/friday-report {day}            → (re)send it to report@gershonconsulting.com.
const dayOf = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : nyParts().day);

export async function onRequestGet({ request, env }) {
  const rep = await buildFridayReport(env, dayOf(new URL(request.url).searchParams.get('day')));
  return new Response(`<!doctype html><meta charset="utf-8"><title>${rep.subject}</title>${rep.html}`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const rep = await buildFridayReport(env, dayOf(body.day));
  await sendEmail(env, { to: [REPORT_TO], subject: rep.subject, html: rep.html, text: rep.text, from: 'GC Talking Points <talkingpoints@gershon.ai>' });
  return json({ ok: true, sent_to: REPORT_TO, subject: rep.subject, total: rep.total });
}
