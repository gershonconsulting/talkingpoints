import { sendEmail } from './_lib.js';
import { nyParts } from './_weekly.js';

// ---------- Friday report (Olivier, 2026-11-11) ----------
// When the Friday run is finished, one email goes to report@gershonconsulting.com with the
// number of talking points sent per client (convention: "[Platform] Report — [Date]").
// Counts come from send_log (sent_by 'friday run'), so they are what actually went out.
// Sent once per Friday (app_secrets WEEKLY_REPORT = New York day).
export const REPORT_TO = 'report@gershonconsulting.com';
const DONE = 'WEEKLY_REPORT';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// UTC bounds of a New York calendar day ('YYYY-MM-DD'), as SQLite datetime strings.
export function nyDayBounds(day) {
  const noon = Date.parse(`${day}T12:00:00Z`);
  const nyNoonHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23' }).format(new Date(noon)));
  const offsetH = 12 - nyNoonHour; // 5 in winter (EST), 4 in summer (EDT)
  const start = new Date(Date.parse(`${day}T00:00:00Z`) + offsetH * 3600e3);
  const end = new Date(start.getTime() + 24 * 3600e3);
  const sql = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
  return [sql(start), sql(end)];
}

// Builds the report. `runReport` (optional) = the cron's per-client results for this run, which
// add "already sent earlier" and "research needed" to the counts.
export async function buildFridayReport(env, day, runReport = []) {
  const [from, to] = nyDayBounds(day);
  const clients = (await env.DB.prepare('SELECT id, slug, name FROM clients ORDER BY name').all()).results;
  const sends = (await env.DB.prepare(
    "SELECT client_id, company, lead_name, status, to_list FROM send_log WHERE sent_by = 'friday run' AND created_at >= ? AND created_at < ? ORDER BY created_at"
  ).bind(from, to).all()).results;
  const bySlug = Object.fromEntries(runReport.map((r) => [r.client, r]));

  const rows = clients.map((c) => {
    const mine = sends.filter((s) => s.client_id === c.id);
    const ok = mine.filter((s) => s.status === 'sent');
    const r = bySlug[c.slug] || {};
    const fridayNote = (r.notes || []).filter((n) => n.startsWith('friday')).map((n) => n.replace(/^friday:\s*/, ''));
    return {
      name: c.name,
      sent: ok.length,
      failed: mine.length - ok.length,
      leads: ok.map((s) => `${s.company}${s.lead_name ? ` (${s.lead_name})` : ''}`),
      recipients: [...new Set(ok.flatMap((s) => s.to_list.split(',').map((x) => x.trim()).filter(Boolean)))],
      already: r.friday?.already_sent ?? null,
      research: r.friday?.research_needed ?? null,
      notes: fridayNote,
    };
  }).sort((a, b) => b.sent - a.sent || a.name.localeCompare(b.name));

  const total = rows.reduce((n, r) => n + r.sent, 0);
  const failed = rows.reduce((n, r) => n + r.failed, 0);
  const withSends = rows.filter((r) => r.sent).length;
  const dateText = new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const subject = `Talking Points Report — ${dateText.replace(/^\w+, /, '')} (Friday run)`;
  const withRun = runReport.length > 0;

  const td = 'padding:8px 10px;border-bottom:1px solid #e9ecef;vertical-align:top;font-size:13px;color:#1a1a1a;';
  const th = 'padding:8px 10px;border-bottom:2px solid #FE1B04;text-align:left;font-size:11px;letter-spacing:.8px;text-transform:uppercase;color:#5f6b76;';
  const body = rows.map((r) => `<tr>
<td style="${td}font-weight:700;">${esc(r.name)}</td>
<td style="${td}text-align:center;font-weight:800;font-size:16px;color:${r.sent ? '#FE1B04' : '#9aa3ab'};">${r.sent}</td>
${withRun ? `<td style="${td}text-align:center;">${r.already ?? '—'}</td><td style="${td}text-align:center;">${r.research ? r.research.length : '—'}</td>` : ''}
<td style="${td}">${r.leads.map(esc).join('<br>') || '<span style="color:#9aa3ab;">—</span>'}${r.failed ? `<br><b style="color:#c0392b;">${r.failed} failed</b>` : ''}${r.notes.length ? `<br><span style="color:#b26a00;">${r.notes.map(esc).join('<br>')}</span>` : ''}${r.recipients.length ? `<br><span style="color:#5f6b76;font-size:12px;">To: ${r.recipients.map(esc).join(', ')}</span>` : ''}</td>
</tr>`).join('');

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:760px;margin:0 auto;color:#1a1a1a;">
<div style="border-top:4px solid #FE1B04;padding:18px 0 8px;">
<div style="font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#FE1B04;font-weight:700;">talkingpoints.gershon.ai · Friday run</div>
<div style="font-size:22px;font-weight:800;margin:4px 0;">${esc(dateText)}</div>
<div style="font-size:15px;color:#333;"><b style="color:#FE1B04;font-size:20px;">${total}</b> talking point${total === 1 ? '' : 's'} sent to <b>${withSends}</b> client${withSends === 1 ? '' : 's'}${failed ? ` · <b style="color:#c0392b;">${failed} failed</b>` : ''}.</div>
</div>
<table style="width:100%;border-collapse:collapse;margin-top:12px;">
<tr><th style="${th}">Client</th><th style="${th}text-align:center;">Sent</th>${withRun ? `<th style="${th}text-align:center;">Already sent earlier</th><th style="${th}text-align:center;">Research needed</th>` : ''}<th style="${th}">Talking points</th></tr>
${body}
<tr><td style="${td}font-weight:800;border-top:2px solid #1a1a1a;">Total</td><td style="${td}text-align:center;font-weight:800;font-size:16px;border-top:2px solid #1a1a1a;">${total}</td>${withRun ? `<td style="${td}border-top:2px solid #1a1a1a;"></td><td style="${td}border-top:2px solid #1a1a1a;"></td>` : ''}<td style="${td}border-top:2px solid #1a1a1a;"></td></tr>
</table>
<p style="font-size:12px;color:#5f6b76;margin-top:16px;">Each Friday, the 5 newest Streak leads of every client get their researched talking point; a lead is never sent twice. Details: <a href="https://talkingpoints.gershon.ai/app#admin" style="color:#FE1B04;">Admin → Friday talking points</a>.</p>
</div>`;

  const text = [`Talking Points — Friday run — ${dateText}`, `${total} talking points sent to ${withSends} clients${failed ? `, ${failed} failed` : ''}.`, '',
    ...rows.map((r) => `${r.name}: ${r.sent}${r.leads.length ? ` — ${r.leads.join('; ')}` : ''}${r.notes.length ? ` [${r.notes.join('; ')}]` : ''}`)].join('\n');

  return { day, subject, html, text, total, failed, clients: rows };
}

// Called at the end of the hourly cron. Sends only on the Friday run (some client ran its Friday
// step in this call), once per Friday.
export async function maybeSendFridayReport(env, runReport) {
  if (!runReport.some((r) => r.friday)) return null;
  const { day } = nyParts();
  const done = await env.DB.prepare('SELECT value FROM app_secrets WHERE name = ?').bind(DONE).first();
  if (done?.value === day) return null;
  const rep = await buildFridayReport(env, day, runReport);
  await sendEmail(env, { to: [REPORT_TO], subject: rep.subject, html: rep.html, text: rep.text, from: 'GC Talking Points <talkingpoints@gershon.ai>' });
  await env.DB.prepare('INSERT INTO app_secrets (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value').bind(DONE, day).run();
  return { sent_to: REPORT_TO, total: rep.total };
}
