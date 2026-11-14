# Talking Points (talkingpoints.gershon.ai) — status
Last updated: 2026-11-14 · v1.11.2 · deploy: push/merge to main → .github/workflows/deploy.yml (Pages project gershon-talkingpoints)
Bump VERSION, public/version.txt and APP_VERSION in public/app.js together on every release.

## Runs (hourly GitHub cron → POST /api/cron/run)
- Daily (first run after 7 AM NY): new Streak leads → "research needed" notes.
- Meetings: researched talking point emailed before calendar meetings (if calendar connected).
- Fridays (every hourly run from 7 AM NY): every new lead (last 14 days) per client, researched only, never twice (send_log), to Settings + logins + client.gershon.ai report recipients.
- Friday report: first run from 6 PM NY Friday (Saturday fallback) → report@gershonconsulting.com, number sent per client.

## ✅ Done
- v1.9.3 Friday run; Nov 6 run sent 32 talking points to 11 clients, 0 failed.
- v1.10.0 "New talking point" on the fly (website / pro email → Workers AI, table quick_briefs).
- v1.11.0 Friday report email + every new lead + whole-team recipients.

## ❌ Open
- New leads need researched talking points before each Friday or nothing new goes out.
- No recipients: Wallix, Altavia (Alexandre).
- Duplicate empty client "#229 Altavia (Anne)" slug `altavia` (id 88475) in D1 — delete needs Olivier's OK.
- Quick talking points: live test with Workers AI on the real site.
