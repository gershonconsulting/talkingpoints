import { randomToken, redirect, cookie } from '../../../_lib.js';

// GET /api/auth/linkedin/start → LinkedIn consent screen
export async function onRequestGet({ env }) {
  const state = randomToken(16);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env.LINKEDIN_CLIENT_ID,
    redirect_uri: `${env.APP_URL}/api/auth/linkedin/callback`,
    state,
    scope: 'openid profile email',
  });
  return redirect(`https://www.linkedin.com/oauth/v2/authorization?${params}`, {
    'set-cookie': cookie('tp_state', state, { maxAge: 600 }),
  });
}
