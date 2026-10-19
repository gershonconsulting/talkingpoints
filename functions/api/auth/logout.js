import { getCookie, unsign, cookie } from '../../_lib.js';

export async function onRequestPost({ request, env }) {
  const sid = await unsign(env.SESSION_SECRET, getCookie(request, 'tp_session'));
  if (sid) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sid).run();
  return new Response(null, {
    status: 302,
    headers: { location: '/', 'set-cookie': cookie('tp_session', '', { maxAge: 0 }) },
  });
}
