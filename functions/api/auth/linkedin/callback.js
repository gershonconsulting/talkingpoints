import { getCookie, randomToken, redirect, sign, cookie } from '../../../_lib.js';

// GET /api/auth/linkedin/callback?code=…&state=…
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const fail = (reason) => redirect(`/login.html?error=${reason}`, { 'set-cookie': cookie('tp_state', '', { maxAge: 0 }) });

  if (url.searchParams.get('error')) return fail('cancelled');
  if (!code || !state || state !== getCookie(request, 'tp_state')) return fail('expired');

  // 1. Exchange the code for tokens
  const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${env.APP_URL}/api/auth/linkedin/callback`,
      client_id: env.LINKEDIN_CLIENT_ID,
      client_secret: env.LINKEDIN_CLIENT_SECRET,
    }),
  });
  if (!tokenRes.ok) return fail('linkedin');
  const { access_token } = await tokenRes.json();

  // 2. Who is this? (OIDC userinfo: sub, name, email, picture)
  const meRes = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { authorization: `Bearer ${access_token}` },
  });
  if (!meRes.ok) return fail('linkedin');
  const me = await meRes.json();
  const email = String(me.email || '').toLowerCase();
  if (!email) return fail('noemail');

  // 3. Match to a member, or to a client by email domain
  // A person signs in with their LinkedIn email, which is often not their work email (members.login_email).
  let member = await env.DB.prepare('SELECT * FROM members WHERE lower(login_email) = ? OR email = ? ORDER BY (lower(login_email) = ?) DESC').bind(email, email, email).first();
  if (!member) {
    const domain = email.split('@')[1];
    const client = await env.DB.prepare(
      "SELECT * FROM clients WHERE (',' || email_domains || ',') LIKE ?"
    ).bind(`%,${domain},%`).first();
    if (!client) return fail('notinvited');
    await env.DB.prepare('INSERT INTO members (client_id, email, name) VALUES (?, ?, ?)')
      .bind(client.id, email, me.name || '').run();
    member = await env.DB.prepare('SELECT * FROM members WHERE email = ?').bind(email).first();
  }

  await env.DB.prepare(
    `UPDATE members SET linkedin_sub = ?, name = COALESCE(NULLIF(name, ''), ?), picture = ?, last_login_at = datetime('now') WHERE id = ?`
  ).bind(me.sub || null, me.name || '', me.picture || '', member.id).run();

  // 4. Session
  const sid = randomToken(32);
  await env.DB.prepare("INSERT INTO sessions (id, member_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))")
    .bind(sid, member.id).run();

  const headers = new Headers({ location: '/app' });
  headers.append('set-cookie', cookie('tp_session', await sign(env.SESSION_SECRET, sid)));
  headers.append('set-cookie', cookie('tp_state', '', { maxAge: 0 }));
  return new Response(null, { status: 302, headers });
}
