import { json, streak, clientStreakKey, getSettings, rowToBrief } from '../../_lib.js';
import { buildDraft, buildDraftFromLead, emailBrief } from '../../_brief.js';
import { googleAccessToken, listEvents } from '../../_google.js';

// POST /api/cron/run  (Authorization: Bearer <INGEST_TOKEN>) — called every hour by
// .github/workflows/cron.yml. For every client:
//   1. New leads: any Streak box created since the last check gets a draft brief
//      (safety net behind the Streak webhook).
//   2. Meetings: every calendar meeting with an outside attendee starting within the next
//      `lead_hours` (default 48h) gets its talking points prepared and emailed once.
export async function onRequestPost({ request, env }) {
  if (!env.INGEST_TOKEN || request.headers.get('authorization') !== `Bearer ${env.INGEST_TOKEN}`) return json({ error: 'forbidden' }, 403);
  const clients = (await env.DB.prepare('SELECT * FROM clients').all()).results;
  const report = [];
  for (const c of clients) {
    const r = { client: c.slug, new_leads: 0, meetings_prepared: 0, emails_sent: 0, notes: [] };
    try { await newLeads(env, c, r); } catch (e) { r.notes.push(`leads: ${e.message}`); }
    try { await meetings(env, c, r); } catch (e) { r.notes.push(`calendar: ${e.message}`); }
    report.push(r);
  }
  return json({ ok: true, at: new Date().toISOString(), report });
}

async function newLeads(env, client, r) {
  const key = await clientStreakKey(env, client.id);
  if (!key || !client.pipeline_key) { r.notes.push('Streak not connected'); return; }
  const s = (await getSettings(env, client.id)) || {};
  const since = s.streak_checked_at || Date.now() - 24 * 3600 * 1000;
  const boxes = await streak(key, `/v1/pipelines/${client.pipeline_key}/boxes?sortBy=creationTimestamp&limit=25`);
  const fresh = (Array.isArray(boxes) ? boxes : []).filter((b) => (b.creationTimestamp || 0) > since).slice(0, 5);
  for (const b of fresh) {
    const boxKey = b.boxKey || b.key;
    const has = await env.DB.prepare('SELECT 1 FROM briefs WHERE box_key = ?').bind(boxKey).first();
    if (!has) { await buildDraft(env, client, boxKey); r.new_leads++; }
  }
  await env.DB.prepare('INSERT OR IGNORE INTO client_settings (client_id) VALUES (?)').bind(client.id).run();
  await env.DB.prepare('UPDATE client_settings SET streak_checked_at = ? WHERE client_id = ?').bind(Date.now(), client.id).run();
}

async function meetings(env, client, r) {
  const s = await getSettings(env, client.id);
  if (!s?.google_refresh_enc) { r.notes.push('calendar not connected'); return; }
  const token = await googleAccessToken(env, s);
  if (!token) { r.notes.push('calendar access expired, reconnect in Settings'); return; }

  const now = new Date();
  const until = new Date(now.getTime() + (s.lead_hours || 48) * 3600 * 1000);
  const events = await listEvents(token, s.calendar_id, new Date(now.getTime() + 3600 * 1000), until);

  // People who are "us": the client's own members, their email domains and the calendar owner.
  const members = (await env.DB.prepare('SELECT email FROM members WHERE client_id = ?').bind(client.id).all()).results.map((m) => m.email.toLowerCase());
  const ownDomains = new Set([
    ...String(client.email_domains || '').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean),
    (s.google_email || '').split('@')[1],
    'gershonconsulting.com',
  ].filter(Boolean));
  const isOutside = (a) => a.email && !a.self && !a.resource && !members.includes(a.email.toLowerCase()) && !ownDomains.has(a.email.split('@')[1].toLowerCase());

  const key = await clientStreakKey(env, client.id);
  for (const ev of events) {
    if (ev.status === 'cancelled' || !ev.start?.dateTime) continue;
    const guest = (ev.attendees || []).find(isOutside);
    if (!guest || guest.responseStatus === 'declined') continue;

    const seen = await env.DB.prepare('SELECT * FROM meetings WHERE client_id = ? AND event_id = ?').bind(client.id, ev.id).first();
    if (seen?.sent_at) continue;

    const when = new Date(ev.start.dateTime);
    const whenText = when.toLocaleString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: ev.start.timeZone || 'America/New_York', timeZoneName: 'short' });
    const header = {
      when: whenText,
      location: ev.hangoutLink ? `Google Meet · ${ev.hangoutLink.replace('https://', '')}` : ev.location || '',
      chips: [{ label: 'MEETING', tone: 'brand' }],
      source_line: ev.summary ? `Calendar: _${ev.summary}_` : '',
    };

    // Find the lead in Streak by the attendee's email; otherwise brief from the invite itself.
    let boxKey = seen?.box_key || '';
    if (!boxKey && key) {
      try {
        const found = await streak(key, `/v1/search?query=${encodeURIComponent(guest.email)}`);
        const boxes = found?.results?.boxes || [];
        boxKey = (boxes.find((b) => b.pipelineKey === client.pipeline_key) || boxes[0] || {}).boxKey || '';
      } catch { /* not found */ }
    }

    let brief;
    if (boxKey) {
      brief = rowToBrief(await env.DB.prepare('SELECT * FROM briefs WHERE box_key = ?').bind(boxKey).first()) || (await buildDraft(env, client, boxKey));
      brief.data.header = { ...brief.data.header, ...header };
    } else {
      boxKey = `cal:${client.id}:${ev.id}`;
      const domain = guest.email.split('@')[1];
      brief = rowToBrief(await env.DB.prepare('SELECT * FROM briefs WHERE box_key = ?').bind(boxKey).first()) ||
        (await buildDraftFromLead(env, client, boxKey, {
          company: domain, leadName: guest.displayName || guest.email, leadRole: '', leadEmail: guest.email,
          stage: 'Meeting', notes: ev.description || '', linkedin: '',
        }, { header }));
      r.notes.push(`${guest.email} is not in Streak`);
    }

    await env.DB.prepare(
      `INSERT INTO meetings (client_id, event_id, box_key, title, attendee, starts_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(client_id, event_id) DO UPDATE SET box_key = excluded.box_key, title = excluded.title, starts_at = excluded.starts_at`
    ).bind(client.id, ev.id, boxKey, ev.summary || '', guest.email, when.toISOString()).run();
    r.meetings_prepared++;

    const sent = await emailBrief(env, client, brief, {
      force: true,
      subjectDate: when.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    });
    if (sent) {
      r.emails_sent++;
      await env.DB.prepare("UPDATE meetings SET sent_at = datetime('now') WHERE client_id = ? AND event_id = ?").bind(client.id, ev.id).run();
    }
  }
}
