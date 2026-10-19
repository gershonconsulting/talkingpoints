// Google Calendar access for a client (Settings → Connect Google Calendar).
// Needs GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (OAuth client, redirect
// https://talkingpoints.gershon.ai/api/google/callback, scope calendar.readonly).
import { decryptText } from './_lib.js';

export const GOOGLE_SCOPES = 'openid email https://www.googleapis.com/auth/calendar.readonly';

export async function googleAccessToken(env, settings) {
  const refresh = await decryptText(env, settings?.google_refresh_enc);
  if (!refresh || !env.GOOGLE_CLIENT_ID) return null;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refresh,
      grant_type: 'refresh_token',
    }),
  });
  if (!r.ok) return null;
  return (await r.json()).access_token || null;
}

export async function listEvents(token, calendarId, timeMin, timeMax) {
  const q = new URLSearchParams({
    timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(),
    singleEvents: 'true', orderBy: 'startTime', maxResults: '100',
  });
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId || 'primary')}/events?${q}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`Google Calendar ${r.status}`);
  return (await r.json()).items || [];
}

export async function listCalendars(token) {
  const r = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader', {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok) return [];
  return ((await r.json()).items || []).map((c) => ({ id: c.id, name: c.summaryOverride || c.summary, primary: !!c.primary }));
}
