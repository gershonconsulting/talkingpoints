// Shared helpers for talkingpoints.gershon.ai (Cloudflare Pages Functions)
//
// Required bindings / secrets (wrangler.toml + Pages secrets):
//   DB                       D1 database
//   AI                       Workers AI binding
//   LINKEDIN_CLIENT_ID       LinkedIn app (Sign In with LinkedIn using OpenID Connect)
//   LINKEDIN_CLIENT_SECRET
//   SESSION_SECRET           random 32+ chars, signs the session cookie
//   STREAK_API_KEY           Streak API key (Gershon account that sees the "- LG" pipelines)
//   RESEND_API_KEY           Resend key (gershon.ai domain verified)
//   WEBHOOK_TOKEN            shared token in the Streak webhook URL (?token=...)
//   APP_URL                  https://talkingpoints.gershon.ai

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });

export const redirect = (location, headers = {}) =>
  new Response(null, { status: 302, headers: { location, ...headers } });

const enc = new TextEncoder();

export function randomToken(bytes = 32) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export async function sign(secret, value) {
  return `${value}.${await hmac(secret, value)}`;
}

export async function unsign(secret, signed) {
  if (!signed) return null;
  const i = signed.lastIndexOf('.');
  if (i < 1) return null;
  const value = signed.slice(0, i);
  const expected = await hmac(secret, value);
  // constant-time-ish compare
  const got = signed.slice(i + 1);
  if (got.length !== expected.length) return null;
  let diff = 0;
  for (let k = 0; k < got.length; k++) diff |= got.charCodeAt(k) ^ expected.charCodeAt(k);
  return diff === 0 ? value : null;
}

export function getCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

export function cookie(name, value, { maxAge = 60 * 60 * 24 * 30, path = '/' } = {}) {
  return `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

// The only person allowed into /admin (Olivier's LinkedIn email).
export const OWNER_EMAILS = ['olivier@attia.com'];
export const isOwner = (u) => !!u && OWNER_EMAILS.includes(String(u.email || '').toLowerCase());

// Returns { member, client } for the signed-in user, or null.
export async function currentUser(env, request) {
  const sid = await unsign(env.SESSION_SECRET, getCookie(request, 'tp_session'));
  if (!sid) return null;
  const row = await env.DB.prepare(
    `SELECT m.*, c.slug AS client_slug, c.name AS client_name, c.pipeline_key
       FROM sessions s JOIN members m ON m.id = s.member_id JOIN clients c ON c.id = m.client_id
      WHERE s.id = ? AND s.expires_at > datetime('now')`
  ).bind(sid).first();
  return row || null;
}

// ---------- Secrets at rest (Streak key, Google refresh token) ----------
async function aesKey(env) {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(`tp-at-rest:${env.SESSION_SECRET}`));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function encryptText(env, text) {
  if (!text) return '';
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env), enc.encode(text)));
  return `${b64(iv)}.${b64(ct)}`;
}

export async function decryptText(env, blob) {
  if (!blob) return '';
  try {
    const [iv, ct] = blob.split('.');
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(env), unb64(ct));
    return new TextDecoder().decode(pt);
  } catch { return ''; }
}

export async function getSettings(env, clientId) {
  return (await env.DB.prepare('SELECT * FROM client_settings WHERE client_id = ?').bind(clientId).first()) || null;
}

// The client's own Streak API key (from Settings); falls back to Gershon's key if one is configured.
export async function clientStreakKey(env, clientId) {
  const s = await getSettings(env, clientId);
  return (await decryptText(env, s?.streak_key_enc)) || (await gershonStreakKey(env));
}

// Gershon's own Streak key (sees every "- LG" pipeline). A Pages secret wins; otherwise the owner
// pastes it once in /admin and it is kept encrypted in D1 (app_secrets GERSHON_STREAK_KEY_ENC).
export async function gershonStreakKey(env) {
  if (env.STREAK_API_KEY) return env.STREAK_API_KEY;
  const row = await env.DB.prepare("SELECT value FROM app_secrets WHERE name = 'GERSHON_STREAK_KEY_ENC'").first().catch(() => null);
  return row?.value ? await decryptText(env, row.value) : '';
}

// ---------- Streak ----------
// Accepts a pipeline key or a pasted Streak link (https://www.streak.com/a/pipelines/<key>[/...]).
export const pipelineKeyFrom = (v) => {
  const t = String(v || '').trim();
  const m = t.match(/\/pipelines\/([^/?#\s]+)/);
  return m ? m[1] : t;
};
const STREAK = 'https://api.streak.com/api';

// `key` is the client's own Streak API key (Settings), see clientStreakKey().
export async function streak(key, path, init = {}) {
  if (!key) throw new Error('Streak is not connected');
  const res = await fetch(`${STREAK}${path}`, {
    ...init,
    headers: {
      authorization: 'Basic ' + btoa(`${key}:`),
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Streak ${path} → ${res.status}`);
  return res.json();
}

// Pull what we need about a lead from its Streak box.
export async function loadLead(key, boxKey) {
  const box = await streak(key, `/v1/boxes/${boxKey}`);
  const pipeline = await streak(key, `/v1/pipelines/${box.pipelineKey}`);
  const stage = pipeline.stages?.[box.stageKey]?.name || '';
  const fieldName = Object.fromEntries((pipeline.fields || []).map((f) => [f.key, f.name]));
  const fields = {};
  for (const [k, v] of Object.entries(box.fields || {})) fields[fieldName[k] || k] = v;

  let contact = null;
  const firstContact = box.contacts?.[0]?.key;
  if (firstContact) {
    try { contact = await streak(key, `/v2/contacts/${firstContact}`); } catch { /* optional */ }
  }
  return {
    boxKey,
    pipelineKey: box.pipelineKey,
    company: box.name || '',
    stage,
    notes: box.notes || '',
    linkedin: (fields.Thread || '').startsWith('http') ? fields.Thread : '',
    leadName: contact ? [contact.givenName, contact.familyName].filter(Boolean).join(' ') : '',
    leadRole: contact?.title || '',
    leadEmail: contact?.emailAddresses?.[0] || '',
  };
}

// ---------- Draft brief (Cloudflare Workers AI) ----------
// Produces the brief JSON (see _render.js) from what the app can read on its own:
// the Streak box, the client team's backgrounds, the lead's enriched profile and public financials.
// The full research pass (LinkedIn, social audit, industry pulse, events) is pushed later via
// POST /api/briefs and replaces this draft.
const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

export async function generateBrief(env, { lead, clientName, team, financials, company = '', icp = '' }) {
  const teamText = team
    .map((m) => `- ${m.name} (${m.title || 'team member'}): ${m.background || 'no background on file'}`)
    .join('\n');

  const prompt = `You prepare a sales brief for ${clientName}'s team about a new lead in their US pipeline.

LEAD
Company: ${lead.company}
Person: ${lead.leadName} — ${lead.leadRole}
CRM stage: ${lead.stage}
LinkedIn: ${lead.linkedin || 'n/a'}
CRM notes: ${lead.notes || '(none)'}
Profile: ${lead.leadProfile || '(no enriched profile yet)'}
Public financials: ${financials?.text || '(none found)'}

${clientName.toUpperCase()} — THE COMPANY
${company || '(no company description yet)'}

${clientName.toUpperCase()} — IDEAL CUSTOMER PROFILE
${icp || '(no ICP yet)'}

${clientName.toUpperCase()} TEAM
${teamText}

Rules: never invent facts. Only use what is above. If something is unknown, leave it out.
Find genuine overlaps between the lead and each team member (employers, schools, cities, countries,
therapeutic areas, conferences, topics). If there is little in common, say so and lean on timing instead.
"Lead with this" must tie what ${clientName} sells to this lead, using the ICP to say why the lead fits.
Use **bold** for the key fact in a sentence.

Return ONLY JSON:
{"in_common":{"best_match":{"name":"<team member>","reason":"<one sentence>"},"items":["<overlap>", "..."]},
 "lead_with":[{"title":"<short heading>","text":"<1-3 sentences>"}],
 "person":{"text":"<what we know about the lead>"},
 "talking_points":["<question or point>", "..."],
 "attention":[{"title":"<data problem or risk>","text":"<what to do>"}]}`;

  const out = await env.AI.run(MODEL, {
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1500,
    temperature: 0.3,
  });
  const text = typeof out === 'string' ? out : out.response ?? JSON.stringify(out);
  const match = text.match(/\{[\s\S]*\}/);
  let ai = {};
  try { ai = match ? JSON.parse(match[0]) : {}; } catch { ai = {}; }

  return {
    header: {
      company: lead.company,
      person: lead.leadName,
      role: lead.leadRole,
      when: `Added to your pipeline ${new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}`,
      chips: [{ label: (lead.stage || 'New lead').toUpperCase(), tone: 'brand' }, { label: 'DRAFT — FULL RESEARCH PENDING', tone: 'warn' }],
      source_line: lead.linkedin ? `LinkedIn: ${lead.linkedin}` : '',
    },
    snapshot: [
      { label: 'Stage', value: lead.stage || 'n/a' },
      { label: 'Role', value: lead.leadRole || 'n/a' },
    ],
    in_common: ai.in_common || null,
    lead_with: ai.lead_with || [],
    person: ai.person?.text ? { name: lead.leadName, text: ai.person.text } : null,
    financials: financials ? { country: financials.country, text: financials.text } : null,
    history: lead.notes ? { text: lead.notes } : null,
    talking_points: ai.talking_points || [],
    attention: ai.attention || [],
    sources: [
      { used: true, text: 'Streak: campaign pipeline record' },
      { used: !!lead.leadProfile, text: lead.leadProfile ? 'LinkedIn: lead profile' : 'LinkedIn: lead profile not read yet' },
      { used: !!financials, text: financials ? `${financials.source}: company registry` : 'Company registry: no public financials found' },
    ],
    footer: `Gershon Consulting · Talking Points · prepared ${new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}`,
  };
}

// App version (semver), bumped with every change; also sent as the User-Agent.
export const VERSION = '1.6.0';

// Email goes out through Resend. With our own RESEND_API_KEY we call Resend directly; without
// it, the email is queued in D1 and social.gershon.ai sends it with its Resend key (the relay
// reads the queued email back once via GET /api/outbox/:id), so no key is ever copied.
// `from`: brief emails pass the sender chosen by _audience.js ("GC Talking Points" for all-Gershon
// recipients, "Gershon Consulting" otherwise); the default is the client-facing one.
export async function sendEmail(env, { to, subject, html, text, reply_to = 'olivier@gershonconsulting.com', from = 'Gershon Consulting <talkingpoints@gershon.ai>' }) {
  if (env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json', 'user-agent': `talkingpoints.gershon.ai/${VERSION}` },
      body: JSON.stringify({ from, reply_to, to, subject, html, text }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    return res.json();
  }
  const id = randomToken(24);
  await env.DB.prepare('INSERT INTO outbox (id, to_list, subject, html, text, reply_to) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, JSON.stringify(to), subject, html, text || '', reply_to).run();
  const res = await fetch('https://social.gershon.ai/api/relay/talkingpoints', {
    method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': `talkingpoints.gershon.ai/${VERSION}` }, body: JSON.stringify({ id, from }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.ok) throw new Error(`Relay ${res.status}: ${JSON.stringify(out)}`);
  return out;
}

// Records one send attempt in send_log (never throws).
export async function logSend(env, { client_id, box_key = '', company = '', lead_name = '', sent_by = '', to = [], status = 'sent', error = '' }) {
  try {
    await env.DB.prepare('INSERT INTO send_log (client_id, box_key, company, lead_name, sent_by, to_list, status, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(client_id, box_key, company, lead_name, sent_by, (Array.isArray(to) ? to : [to]).join(', '), status, String(error).slice(0, 500)).run();
  } catch { /* the log must never block a send */ }
}

export function rowToBrief(r) {
  if (!r) return null;
  let data = {};
  try { data = JSON.parse(r.data || '{}'); } catch { data = {}; }
  return { ...r, data };
}
