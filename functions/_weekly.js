import { streak, clientStreakKey, rowToBrief, scheduledOnly, scheduledBoxes } from './_lib.js';
import { emailBrief } from './_brief.js';

// ---------- Friday talking points (2026-11-05, widened 2026-11-11) ----------
// Every Friday (first hourly run after 7 am New York time), for EVERY client in Talking Points:
// EVERY new lead of its Streak pipeline (created in the last NEW_LEAD_DAYS days — not only the
// newest 5, Olivier 2026-11-11) gets its talking point emailed to the client's whole team
// (Settings recipients + client.gershon.ai report recipients, see recipients() in _brief.js). No duplicate: a lead whose talking point was already emailed once (any run, any
// sender — send_log) is never sent again. Only researched briefs are sent (no quick drafts since
// 2026-10-30); a newest lead without one is listed as "research needed" (Admin → Friday talking points).
// Gershon's own pipelines keep their rule: only leads in the "Scheduled" stage.
export const WEEKLY_COUNT = 5;      // kept for the Admin table header (legacy)
export const NEW_LEAD_DAYS = 14;   // a lead not researched by its first Friday is still sent the next one
// Same-day talking points (Olivier, 2026-11-19, option 2): new leads are researched each morning and
// the app sends them the SAME afternoon — every hourly run from SAME_DAY_HOUR (New York time) sends
// the researched new leads not sent yet. Fridays keep their all-day window from 7 AM (backup run).
export const SAME_DAY_HOUR = 16;

// HOLD (Olivier, 2026-11-20 "3"): the AllerGene brief sent to MAbSilico was too light (no client
// knowledge base, missing sections). Automatic sends are held for ALL clients until the rebuilt,
// knowledge-based talking points are in place — then they are all sent the same day. Manual sends
// from a brief page still work.
export const AUTO_SEND_PAUSED = true;

// Safety default (review of PR #32, 2026-11-20): no same-day sends on Saturday/Sunday (New York time).
// Leads that arrive over the weekend go out Monday from SAME_DAY_HOUR.
export const NO_WEEKEND_SENDS = true;
// Safety default (review of PR #32, 2026-11-20): no backlog blast. The first same-day run only considers
// leads created in the last FIRST_RUN_LOOKBACK_HOURS; later runs keep that same start (the first run's
// time, stored once in app_secrets as SAME_DAY_STARTED_AT), so the 14-day backlog is never AI-built or
// sent by the same-day feature. Friday researched sends keep their 14-day rule (unchanged from v1.12.x).
export const FIRST_RUN_LOOKBACK_HOURS = 24;
export const SAME_DAY_START_KEY = 'SAME_DAY_STARTED_AT';

// Is the send window open at New York time `now` ({ weekday, hour } from nyParts)?
export function sendWindowOpen(now) {
  if (NO_WEEKEND_SENDS && (now.weekday === 'Sat' || now.weekday === 'Sun')) return false;
  return now.weekday === 'Fri' ? now.hour >= 7 : now.hour >= SAME_DAY_HOUR;
}

// Oldest lead creation time (ms) the same-day feature may build or send for, given when it first ran.
export function sameDayCutoff(startedAt, nowMs = Date.now()) {
  return Math.max(nowMs - NEW_LEAD_DAYS * 24 * 3600e3, startedAt - FIRST_RUN_LOOKBACK_HOURS * 3600e3);
}

// When the same-day feature first ran (ms). The first call stores "now" (INSERT OR IGNORE, so concurrent
// runs agree on one value); every later call reads it back.
export async function sameDayStart(env, nowMs = Date.now()) {
  await env.DB.prepare('INSERT OR IGNORE INTO app_secrets (name, value) VALUES (?, ?)').bind(SAME_DAY_START_KEY, String(nowMs)).run();
  const row = await env.DB.prepare('SELECT value FROM app_secrets WHERE name = ?').bind(SAME_DAY_START_KEY).first();
  const v = Number(row?.value);
  return Number.isFinite(v) && v > 0 ? v : nowMs;
}

// Is this Streak box new enough for the same-day feature? Gershon's own "Scheduled" pipelines count
// the time the box entered its stage (a call just scheduled on an older lead), others its creation.
export function sameDayEligible(box, cutoff, { scheduled = false } = {}) {
  const t = scheduled ? (box.lastStageChangeTimestamp || box.creationTimestamp || 0) : (box.creationTimestamp || 0);
  return t >= cutoff;
}

export function nyParts(ms = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), weekday: p.weekday };
}

// The client's new leads (created in the last NEW_LEAD_DAYS days; Gershon's own pipelines: every
// "Scheduled" lead), newest first, each with its talking-point status. `n` caps the list (Admin view).
export async function lastLeads(env, client, n = 200) {
  const key = await clientStreakKey(env, client.id);
  if (!key || !client.pipeline_key) return { connected: false, leads: [] };
  let boxes;
  if (scheduledOnly(client)) boxes = (await scheduledBoxes(key, client.pipeline_key)).boxes;
  else {
    const res = await streak(key, `/v1/pipelines/${client.pipeline_key}/boxes?sortBy=creationTimestamp&limit=500`);
    boxes = Array.isArray(res) ? res : [];
  }
  boxes.sort((a, b) => (b.creationTimestamp || 0) - (a.creationTimestamp || 0));
  if (!scheduledOnly(client)) {
    const since = Date.now() - NEW_LEAD_DAYS * 24 * 3600e3;
    boxes = boxes.filter((b) => (b.creationTimestamp || 0) >= since);
  }
  const leads = [];
  for (const b of boxes.slice(0, n)) {
    const boxKey = b.boxKey || b.key;
    const brief = rowToBrief(await env.DB.prepare("SELECT * FROM briefs WHERE box_key = ? AND status = 'ready'").bind(boxKey).first());
    const sent = await env.DB.prepare("SELECT created_at FROM send_log WHERE box_key = ? AND status = 'sent' ORDER BY created_at LIMIT 1").bind(boxKey).first();
    leads.push({
      box_key: boxKey,
      name: b.name || '',
      created: b.creationTimestamp ? new Date(b.creationTimestamp).toISOString() : '',
      box: { creationTimestamp: b.creationTimestamp, lastStageChangeTimestamp: b.lastStageChangeTimestamp },
      researched: !!brief,
      sent_at: sent?.created_at || null,
      status: sent ? 'sent' : brief ? 'ready to send' : 'research needed',
      brief,
    });
  }
  return { connected: true, leads };
}

// Called by the hourly cron. Every day from 4 pm New York time (Fridays from 7 am), EVERY hourly run sends the
// researched new leads not sent yet (2026-11-13: a talking point researched during the day still
// goes out that Friday). No duplicate: send_log is checked lead by lead. `force` ignores the day.
export async function fridayRun(env, client, r, { force = false } = {}) {
  if (AUTO_SEND_PAUSED && !force) { r.notes.push('friday: automatic sends on hold (talking-point quality fix, 2026-11-20)'); return; }
  const now = nyParts();
  if (!force && !sendWindowOpen(now)) return;
  const sentBy = now.weekday === 'Fri' ? 'friday run' : 'same-day run';
  // Weekday afternoons (not Fridays, not forced): only leads since the same-day start (no backlog blast).
  const cutoff = !force && now.weekday !== 'Fri' ? sameDayCutoff(await sameDayStart(env)) : null;

  // No ICP, no talking points (Olivier, 2026-11-05): a brief can't be judged against the client's ICP without one.
  const tpl = await env.DB.prepare('SELECT icp FROM client_templates WHERE client_id = ?').bind(client.id).first();
  if (!String(tpl?.icp || '').trim()) { r.notes.push('friday: ICP missing — nothing sent; add it in Admin'); return; }
  const { connected, leads } = await lastLeads(env, client);
  r.friday = { sent: 0, already_sent: 0, research_needed: [] };
  if (!connected) r.notes.push('friday: Streak not connected');
  for (const l of leads) {
    if (l.sent_at) { r.friday.already_sent++; continue; }        // no duplicate, ever
    if (cutoff !== null && !sameDayEligible(l.box || {}, cutoff, { scheduled: scheduledOnly(client) })) continue;
    if (!l.brief) { r.friday.research_needed.push(l.name || l.box_key); continue; }
    // AI talking points only go out when they pass the quality check (2026-11-20); older AI briefs
    // without the check are rebuilt first (Admin → POST /api/admin/rebuild).
    if (l.brief.data?.auto && !l.brief.data?.quality?.ok) { r.friday.research_needed.push(`${l.name || l.box_key} (too light)`); continue; }
    try {
      const ok = await emailBrief(env, client, l.brief, { force: true, weekly: true, sentBy });
      if (ok) r.friday.sent++; else r.notes.push(`friday: no recipients in Settings — ${l.name}`);
    } catch (e) { r.notes.push(`friday: ${l.name}: ${e.message || e}`); }
  }
}
