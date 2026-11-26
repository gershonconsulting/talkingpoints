# Talking Points (talkingpoints.gershon.ai) — status
Last updated: 2026-11-26 · v1.16.0 (research engine rebuild) · deploy: push/merge to main → .github/workflows/deploy.yml (Pages project gershon-talkingpoints)
Release: edit VERSION, run `node scripts/version.mjs sync` (updates every copy), `node scripts/version.mjs check` must pass.

## Runs (hourly GitHub cron → POST /api/cron/run)
- Every run: new Streak leads (since the same-day start; first run last 24h) → talking point built by Cloudflare AI (functions/_auto.js), max 8 per run.
- Same day: every run from 4 PM NY Mon–Thu (Fridays from 7 AM; never Sat/Sun) sends new leads' talking points not sent yet (send_log, "same-day run").
- Meetings: researched talking point emailed before calendar meetings (if calendar connected).
- Fridays (every hourly run from 7 AM NY): every new lead (last 14 days) per client, researched only, never twice (send_log), to Settings + logins + client.gershon.ai report recipients.
- Friday report: first run from 6 PM NY Friday (Saturday fallback) → report@gershonconsulting.com, number sent per client. Once per date: atomic claim row WEEKLY_REPORT_SENT:<date> + Resend Idempotency-Key tp-report-<date>.

- Monday report: first run from 8 AM NY Monday (Tuesday fallback) → report@gershonconsulting.com, talking points generated per client last week with their grades; any talking point without a grade gets one first (same scale as the engine). Once per Monday (MONDAY_REPORT_SENT:<date> + key tp-monday-<date>).

## ✅ Done
- ✅ 2026-11-26 Monday report (functions/_monday_report.js; owner preview GET /api/admin/monday-report?day=, POST resends) + every talking point has a grade: saveBrief fills a missing one with the engine's computeGrade (functions/_grade.js). Tests: `node --test test/monday_report.test.mjs`. Version not bumped (pushed via the GitHub connector; next release syncs).
- ✅ v1.16.0 (2026-11-26) research engine: web/news/person search, social audit + computed grade, GLEIF + SEC Form D, number check, Ansana structure, strict quality gate. Tests 36/36.
- ✅ PR #43 (2026-11-26) all automatic sends paused after the Phytokana brief.
- v1.9.3 Friday run; Nov 6 run sent 32 talking points to 11 clients, 0 failed.
- v1.10.0 "New talking point" on the fly (website / pro email → Workers AI, table quick_briefs).
- v1.11.0 Friday report email + every new lead + whole-team recipients.
- v1.11.2 (merged 2026-11-14) Friday sends all day; report 6 PM NY.
- v1.12.0 (merged 2026-11-14) unified Gershon design, brand red #FE1B04.
- v1.12.1 (merged 2026-11-14) client users no longer see internal "Needs your attention" block (PR #21).
- v1.12.2 (PR, 2026-11-15) stale old-red mention removed from unified-theme.css comment; no visual change.

- v1.12.3 (PR, 2026-11-16) footer shows the real version: one source (VERSION), sync/check script, footers read /version.txt.
- v1.12.4 (2026-11-18) internal Friday report can only go once per date (Nov 13 report had gone out twice); tests: `node --test test/friday_report_once.test.mjs`.
  HANDOFF: cause = read-send-write guard (race / lost marker); fix = claim-before-send + idempotency key; admin POST /api/admin/friday-report stays a deliberate resend; client emails untouched.
- v1.12.6 (2026-11-20) wording: titles + footer "Talking Points by Gershon.AI · v<version>"; client emails/briefs untouched.

## ❌ Open
- ❌ v1.16.0 research engine: live check on real leads (engine-test workflow) then Olivier's OK to set AUTO_SEND_PAUSED = false (functions/_weekly.js). Until then no automatic talking point goes to any client or to Julien.
- ❌ Search quality: keyless DuckDuckGo/Bing from Cloudflare can be throttled; a TAVILY_API_KEY (or BRAVE_API_KEY) secret makes research reliable.
- v1.13.0 same-day Cloudflare AI talking points: PR #32 awaiting Olivier's OK (changes what clients receive). Merged with main 2026-11-20 (v1.12.5 test mode + v1.12.6 naming kept). Safety: no Sat/Sun sends; first run only leads created in the last 24h (no backlog).
- New leads need researched talking points before each Friday or nothing new goes out.
- No recipients: Wallix, Altavia (Alexandre).
- Duplicate empty client "#229 Altavia (Anne)" slug `altavia` (id 88475) in D1 — delete needs Olivier's OK.
- Quick talking points: live test with Workers AI on the real site.
- CI does not run `node scripts/version.mjs check` yet (workflow edit left for Ariel).
- v1.12.4 was pushed through the GitHub connector: VERSION, version.txt, _lib.js, app.js bumped; run `node scripts/version.mjs sync` to refresh the ?v= cache-busters and static footer text in the 6 html pages (cosmetic).
- Phytokana talking point sent twice on 11-16 with two senders: see PR description / report (client-facing, not changed here).
