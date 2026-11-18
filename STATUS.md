# Talking Points (talkingpoints.gershon.ai) — status
Last updated: 2026-11-18 · v1.12.4 · deploy: push/merge to main → .github/workflows/deploy.yml (Pages project gershon-talkingpoints)
Release: edit VERSION, run `node scripts/version.mjs sync` (updates every copy), `node scripts/version.mjs check` must pass.

## Runs (hourly GitHub cron → POST /api/cron/run)
- Daily (first run after 7 AM NY): new Streak leads → "research needed" notes.
- Meetings: researched talking point emailed before calendar meetings (if calendar connected).
- Fridays (every hourly run from 7 AM NY): every new lead (last 14 days) per client, researched only, never twice (send_log), to Settings + logins + client.gershon.ai report recipients.
- Friday report: first run from 6 PM NY Friday (Saturday fallback) → report@gershonconsulting.com, number sent per client.

## ✅ Done
- v1.9.3 Friday run; Nov 6 run sent 32 talking points to 11 clients, 0 failed.
- v1.10.0 "New talking point" on the fly (website / pro email → Workers AI, table quick_briefs).
- v1.11.0 Friday report email + every new lead + whole-team recipients.
- v1.11.2 (merged 2026-11-14) Friday sends all day; report 6 PM NY.
- v1.12.0 (merged 2026-11-14) unified Gershon design, brand red #FE1B04.
- v1.12.1 (merged 2026-11-14) client users no longer see internal "Needs your attention" block (PR #21).
- v1.12.2 (PR, 2026-11-15) stale old-red mention removed from unified-theme.css comment; no visual change.

- v1.12.3 (PR, 2026-11-16) footer shows the real version: one source (VERSION), sync/check script, footers read /version.txt.
- v1.12.4 (2026-11-18) internal Friday report can only go once per date: atomic claim row + Resend Idempotency-Key tp-report-<date>; tests in test/ (`node --test test/friday_report_once.test.mjs`).

## ❌ Open
- New leads need researched talking points before each Friday or nothing new goes out.
- No recipients: Wallix, Altavia (Alexandre).
- Duplicate empty client "#229 Altavia (Anne)" slug `altavia` (id 88475) in D1 — delete needs Olivier's OK.
- Quick talking points: live test with Workers AI on the real site.
- CI does not run `node scripts/version.mjs check` yet (workflow edit left for Ariel).
- v1.12.4 only bumped app.html/app.js/_lib.js/version.txt (connector push); run `node scripts/version.mjs sync` to refresh the ?v= cache-busters in admin/index/login/privacy/terms.html.
