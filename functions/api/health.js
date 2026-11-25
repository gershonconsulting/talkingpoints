// GET /api/health — public JSON health check with the deployed version (2026-11-25).
// The nightly audit found /api/health returned the HTML app page, so the version could not be read.
import { VERSION } from '../_lib.js';

export async function onRequestGet() {
  return new Response(JSON.stringify({ ok: true, app: 'talkingpoints', version: VERSION }), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
