import { json, sendEmail } from '../../_lib.js';
import { buildMondayReport, ensureGrades } from '../../_monday_report.js';
import { REPORT_TO } from '../../_friday_report.js';
import { nyParts } from '../../_weekly.js';

// Owner only (functions/_middleware.js).
// GET  /api/admin/monday-report?day=YYYY-MM-DD → preview of the Monday report for that Monday (HTML).
// POST /api/admin/monday-report {day}           → give a grade to every talking point without one, then (re)send it.
const dayOf = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : nyParts().day);

export async function onRequestGet({ request, env }) {
  const rep = await buildMondayReport(env, dayOf(new URL(request.url).searchParams.get('day')));
  return new Response(`<!doctype html><meta charset="utf-8"><title>${rep.subject}</title>${rep.html}`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const filled = await ensureGrades(env);
  const rep = await buildMondayReport(env, dayOf(body.day), { filled });
  await sendEmail(env, { to: [REPORT_TO], subject: rep.subject, html: rep.html, text: rep.text, from: 'GC Talking Points <talkingpoints@gershon.ai>' });
  return json({ ok: true, sent_to: REPORT_TO, subject: rep.subject, total: rep.total, graded_now: filled });
}
