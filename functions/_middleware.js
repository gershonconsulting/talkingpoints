// Runs before every request. Makes the app self-sufficient on Cloudflare Pages (no API token):
//  1. Applies schema.sql + seed.sql to D1 (idempotent; see scripts/gen-schema.mjs → _schema.js).
//  2. Creates the internal secrets SESSION_SECRET, WEBHOOK_TOKEN, INGEST_TOKEN once and keeps them
//     in D1 (table app_secrets), so nobody ever types or pastes them. A Pages secret still wins.
//  3. Accepts a GitHub Actions OIDC token from gershonconsulting/talkingpoints (audience
//     talkingpoints.gershon.ai) in place of INGEST_TOKEN, so the hourly GitHub job needs no secret.
import { SQL } from './_schema.js';

const STATEMENTS = SQL.split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean);

const NAMES = ['SESSION_SECRET', 'WEBHOOK_TOKEN', 'INGEST_TOKEN'];
let cache = null;

function random() {
  const a = crypto.getRandomValues(new Uint8Array(32));
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function load(db) {
  await db.batch(STATEMENTS.map((q) => db.prepare(q)));
  await db.prepare('CREATE TABLE IF NOT EXISTS app_secrets (name TEXT PRIMARY KEY, value TEXT NOT NULL)').run();
  await db.batch(NAMES.map((n) => db.prepare('INSERT OR IGNORE INTO app_secrets (name, value) VALUES (?, ?)').bind(n, random())));
  const rows = (await db.prepare('SELECT name, value FROM app_secrets').all()).results || [];
  return Object.fromEntries(rows.map((r) => [r.name, r.value]));
}

// ---------- GitHub Actions OIDC ----------
const GH_ISS = 'https://token.actions.githubusercontent.com';
const GH_REPO = 'gershonconsulting/talkingpoints';
const GH_AUD = 'talkingpoints.gershon.ai';
let jwks = { at: 0, keys: [] };

const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const b64json = (s) => JSON.parse(new TextDecoder().decode(b64url(s)));

async function githubOidcOk(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  let header, claims;
  try { header = b64json(parts[0]); claims = b64json(parts[1]); } catch { return false; }
  if (header.alg !== 'RS256') return false;
  const now = Math.floor(Date.now() / 1000);
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== GH_ISS || claims.repository !== GH_REPO || !aud.includes(GH_AUD)) return false;
  if (!(claims.exp > now) || (claims.nbf && claims.nbf > now + 60)) return false;
  if (Date.now() - jwks.at > 3600e3 || !jwks.keys.some((k) => k.kid === header.kid)) {
    const res = await fetch(`${GH_ISS}/.well-known/jwks`);
    if (!res.ok) return false;
    jwks = { at: Date.now(), keys: (await res.json()).keys || [] };
  }
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) return false;
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
}

export async function onRequest(context) {
  const { env, request } = context;
  if (env.DB) {
    if (!cache) cache = await load(env.DB);
    for (const n of NAMES) if (!env[n]) env[n] = cache[n];
  }
  const auth = request.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ') && auth.slice(7) !== env.INGEST_TOKEN && auth.slice(7).split('.').length === 3) {
    let ok = false;
    try { ok = await githubOidcOk(auth.slice(7)); } catch { ok = false; }
    if (ok) {
      const headers = new Headers(request.headers);
      headers.set('authorization', `Bearer ${env.INGEST_TOKEN}`);
      return context.next(new Request(request, { headers }));
    }
  }
  return context.next();
}
