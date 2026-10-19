import { currentUser, randomToken, redirect, cookie } from '../../_lib.js';
import { GOOGLE_SCOPES } from '../../_google.js';

// GET /api/google/start → Google consent (read-only calendar access)
export async function onRequestGet({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return redirect('/login');
  if (!u.can_manage && !u.is_admin) return redirect('/app#settings');
  if (!env.GOOGLE_CLIENT_ID) return redirect('/app?google=unavailable#settings');
  const state = randomToken(16);
  const q = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${env.APP_URL}/api/google/callback`,
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`, { 'set-cookie': cookie('tp_gstate', state, { maxAge: 600 }) });
}
