# Talking Points (talkingpoints.gershon.ai) — status
Last updated: 2026-11-11 · v1.9.4 · deploy: push to main → .github/workflows/deploy.yml (Cloudflare Pages)

## Runs (hourly GitHub cron → POST /api/cron/run)
- Daily (first run after 7 AM NY): new Streak leads → "research needed" notes.
- Meetings: researched talking point emailed before calendar meetings (if calendar connected).
- Fridays (first run after 7 AM NY): 5 newest leads per client, researched only, never twice (send_log).
- Friday report (v1.9.4): after the Friday run → report@gershonconsulting.com, count sent per client.

## Done
- ✅ v1.9.3 Friday run live; Nov 6 run sent 32 talking points to 11 clients, 0 failed.
- ✅ v1.9.4 Friday report email (functions/_friday_report.js).

## Open
- ❌ New leads need researched talking points before each Friday or nothing new goes out.
- ❌ No recipients: Wallix, Altavia (Alexandre).
- ❌ Noza recipient is a personal Hotmail address (check).
- ❌ Duplicate empty client "#229 Altavia (Anne)" slug `altavia` (id 88475) is back in D1.
