import { currentUser, json } from '../_lib.js';
import { SECTIONS, getTemplate, saveTemplate } from '../_template.js';

// GET /api/template → the talking-points structure (sections in order, on/off) + company & ICP
// PUT /api/template { disabled:[ids], company, icp } → members who can change Settings, or Gershon admins
export async function onRequestGet({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return json({ error: 'signed_out' }, 401);
  const t = await getTemplate(env, u.client_id);
  return json({
    can_manage: !!(u.can_manage || u.is_admin),
    sections: SECTIONS.map((s) => ({ ...s, on: !t.disabled.includes(s.id) })),
    company: t.company, icp: t.icp,
  });
}

export async function onRequestPut({ request, env }) {
  const u = await currentUser(env, request);
  if (!u) return json({ error: 'signed_out' }, 401);
  if (!u.can_manage && !u.is_admin) return json({ error: 'Only your account manager can change settings.' }, 403);
  const b = await request.json().catch(() => ({}));
  await saveTemplate(env, u.client_id, b);
  return json({ ok: true });
}
