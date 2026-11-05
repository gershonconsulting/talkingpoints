import { streak, clientStreakKey, rowToBrief, scheduledOnly, scheduledBoxes } from './_lib.js';
import { emailBrief } from './_brief.js';

// ---------- Friday talking points (2026-11-05) ----------
// Every Friday (first hourly run after 7 am New York time), for EVERY client in Talking Points:
// the 5 newest leads of its Streak pipeline get their talking point emailed to the client's
// recipients. No duplicate: a lead whose talking point was already emailed once (any run, any
// sender — send_log) is never sent again. Only researched briefs are sent (no quick drafts since
// 2026-10-30); a newest lead without one is listed as "research needed" (Admin → Friday talking points).
// Gershon's own pipelines keep their rule: only leads in the "Scheduled" stage.
export const WEEKLY_COUNT = 5;

export function nyParts(ms = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), weekday: p.weekday };
}

// The client's 5 newest leads, newest first, each with its talking-point status.
export async function lastLeads(env, client, n = WEEKLY_COUNT) {
  const key = await clientStreakKey(env, client.id);
  if (!key || !client.pipeline_key) return { connected: false, leads: [] };
  let boxes;
  if (scheduledOnly(client)) boxes = (await scheduledBoxes(key, client.pipeline_key)).boxes;
  else {
    const res = await streak(key, `/v1/pipelines/${client.pipeline_key}/boxes?sortBy=creationTimestamp&limit=500`);
    boxes = Array.isArray(res) ? res : [];
  }
  boxes.sort((a, b) => (b.creationTimestamp || 0) - (a.creationTimestamp || 0));
  const leads = [];
  for (const b of boxes.slice(0, n)) {
    const boxKey = b.boxKey || b.key;
    const brief = rowToBrief(await env.DB.prepare("SELECT * FROM briefs WHERE box_key = ? AND status = 'ready'").bind(boxKey).first());
    const sent = await env.DB.prepare("SELECT created_at FROM send_log WHERE box_key = ? AND status = 'sent' ORDER BY created_at LIMIT 1").bind(boxKey).first();
    leads.push({
      box_key: boxKey,
      name: b.name || '',
      created: b.creationTimestamp ? new Date(b.creationTimestamp).toISOString() : '',
      researched: !!brief,
      sent_at: sent?.created_at || null,
      status: sent ? 'sent' : brief ? 'ready to send' : 'research needed',
      brief,
    });
  }
  return { connected: true, leads };
}

const doneKey = (clientId) => `WEEKLY_RUN:${clientId}`;

// Called by the hourly cron. Runs once per client per Friday; `force` (owner test) ignores the day.
export async function fridayRun(env, client, r, { force = false } = {}) {
  const now = nyParts();
  if (!force && (now.weekday !== 'Fri' || now.hour < 7)) return;
  const done = await env.DB.prepare('SELECT value FROM app_secrets WHERE name = ?').bind(doneKey(client.id)).first();
  if (!force && done?.value === now.day) return;

  const { connected, leads } = await lastLeads(env, client);
  r.friday = { sent: 0, already_sent: 0, research_needed: [] };
  if (!connected) r.notes.push('friday: Streak not connected');
  for (const l of leads) {
    if (l.sent_at) { r.friday.already_sent++; continue; }        // no duplicate, ever
    if (!l.brief) { r.friday.research_needed.push(l.name || l.box_key); continue; }
    try {
      const ok = await emailBrief(env, client, l.brief, { force: true, weekly: true });
      if (ok) r.friday.sent++; else r.notes.push(`friday: no recipients in Settings — ${l.name}`);
    } catch (e) { r.notes.push(`friday: ${l.name}: ${e.message || e}`); }
  }
  await env.DB.prepare('INSERT INTO app_secrets (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value')
    .bind(doneKey(client.id), now.day).run();
}
