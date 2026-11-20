import { json } from '../../_lib.js';
import { fridayRun } from '../../_weekly.js';
import { maybeSendFridayReport } from '../../_friday_report.js';

// Owner only (functions/_middleware.js).
// POST /api/admin/send-now — runs the app's send step now (same rules as the hourly run: send window,
// quality check, never twice), for every client. Used when GitHub's hourly schedule is late (2026-11-20).
export async function onRequestPost({ env }) {
  const clients = (await env.DB.prepare('SELECT * FROM clients').all()).results;
  const report = [];
  for (const c of clients) {
    const r = { client: c.slug, new_leads: 0, meetings_prepared: 0, emails_sent: 0, notes: [] };
    try { await fridayRun(env, c, r); } catch (e) { r.notes.push(`friday: ${e.message}`); }
    report.push(r);
  }
  let friday_report = null;
  try { friday_report = await maybeSendFridayReport(env, report); } catch (e) { friday_report = { error: e.message || String(e) }; }
  return json({ ok: true, report: report.map((r) => ({ client: r.client, ...(r.friday || {}), notes: r.notes })), friday_report });
}
