import { currentUser, getCookie, redirect, cookie, encryptText } from '../../_lib.js';

// GET /api/google/callback?code=…&state=… → store the calendar refresh token (encrypted)
export async function onRequestGet({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return redirect('/login');
  const url = new URL(request.url);
  const back = (q) => redirect(`/app?google=${q}#settings`, { 'set-cookie': cookie('tp_gstate', '', { maxAge: 0 }) });
  if (url.searchParams.get('error')) return back('cancelled');
  if (url.searchParams.get('state') !== getCookie(request, 'tp_gstate')) return back('expired');

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: url.searchParams.get('code') || '',
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${env.APP_URL}/api/google/callback`,
      grant_type: 'authorization_code',
    }),
  });
  if (!r.ok) return back('failed');
  const t = await r.json();
  if (!t.refresh_token) return back('norefresh');

  let email = '';
  try {
    const me = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${t.access_token}` } });
    email = (await me.json()).email || '';
  } catch { /* optional */ }

  await env.DB.prepare('INSERT OR IGNORE INTO client_settings (client_id) VALUES (?)').bind(u.client_id).run();
  await env.DB.prepare("UPDATE client_settings SET google_refresh_enc = ?, google_email = ?, updated_at = datetime('now') WHERE client_id = ?")
    .bind(await encryptText(env, t.refresh_token), email, u.client_id).run();
  return back('connected');
}
