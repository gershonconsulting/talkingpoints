# Talking Points — versions

Shown in the app sidebar, the Admin page and the home page footer. Bump on every release.

- **Unreleased (bump to v1.5.5 on merge)** — Security: the dashboard no longer shows internal blocks (“Needs your attention”, CRM/Streak flags, internal notes) to client users; `GET/POST /api/leads/:box` return `data` and `html` through `forViewer()`; `/api/me` exposes `is_internal`; the Settings switch for that block is hidden for client users.
- **v1.5.4** (2026-10-30) — Security: brief emails with any recipient outside gershonconsulting.com / gershon.ai are the client version (no “Needs your attention”, CRM/Streak flags or internal notes; sender “Gershon Consulting”); all-Gershon lists get the internal version (sender “GC Talking Points”); subject starts with “[21]” (functions/_audience.js).
- **v1.5.3** (2026-10-28) — Open tabs reload themselves when a new version is deployed (public/version.txt; bump it with VERSION and APP_VERSION in app.js).
- **v1.5.2** (2026-10-28) — Save email settings accepts any pasted format (names, one per line, “Name <email>”), keeps only the addresses and shows how many people will receive the talking points.
- **v1.5.1** (2026-10-28) — Settings no longer pre-fills your own address in “Send talking points to” when the list is empty (it looked saved but wasn't); email subject dates in New York time.
- **v1.5.0** (2026-10-28) — Send log (every talking-point email, who/to whom/when/result, under each brief and in Admin); separate LinkedIn sign-in email from work email; new-lead talking points once a day for every client pipeline; Settings shows the client's Streak pipeline link (no Streak API key for clients); 12 Social Selling campaigns + client logins; version number.
- **v1.4.0** (2026-10-26) — Send by email via social.gershon.ai relay; Download PDF/HTML; network in common from the client's side; posts, groups, events, call hooks.
- **v1.3.0** (2026-10-26) — Admin: live campaigns with Streak links, Test this campaign, talking-points template in Settings.
- **v1.2.0** (2026-10-22) — Researched briefs published from research/*.json; social effectiveness grade.
- **v1.0.0** (2026-10-20) — First release: LinkedIn sign-in, leads from Streak, briefs, Settings.
