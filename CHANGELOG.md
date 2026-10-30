# Talking Points — versions

Shown in the app sidebar, the Admin page and the home page footer. Bump on every release.

- **v1.7.0** (2026-10-30) — Admin → Add a client asks for everything at once: company name, client number, contact, professional email, LinkedIn login email, Streak pipeline, who receives the talking points, company description and ICP. Picking a company from client.gershon.ai fills number, pipeline and report emails; the ICP and company text come from its ICP.gershon.ai report (read-only KV links CRM_KV / ICP_KV).
- **v1.6.0** (2026-10-30) — No more quick AI drafts: only fully researched briefs are listed, opened, sent or emailed. “Create draft” is gone (leads show “Research in progress”); the daily run reports new leads as needing research instead of drafting them; the meeting run only sends a researched brief.
- **v1.5.5** (2026-10-30) — Fix: a lead can only be briefed for the client whose Streak pipeline it is in. “Create draft” refuses a lead from another campaign (it had filed 3 PhiTech leads — NxGen MDx, TrilliumBiO, Golden Valley — under Finance Montréal (Steve) after the campaign was switched in another tab); the meeting run no longer falls back to another client's Streak box.
- **v1.5.4** (2026-10-30) — Security: brief emails with any recipient outside gershonconsulting.com / gershon.ai are the client version (no “Needs your attention”, CRM/Streak flags or internal notes; sender “Gershon Consulting”); all-Gershon lists get the internal version (sender “GC Talking Points”); subject starts with “[21]” (functions/_audience.js).
- **v1.5.3** (2026-10-28) — Open tabs reload themselves when a new version is deployed (public/version.txt; bump it with VERSION and APP_VERSION in app.js).
- **v1.5.2** (2026-10-28) — Save email settings accepts any pasted format (names, one per line, “Name <email>”), keeps only the addresses and shows how many people will receive the talking points.
- **v1.5.1** (2026-10-28) — Settings no longer pre-fills your own address in “Send talking points to” when the list is empty (it looked saved but wasn't); email subject dates in New York time.
- **v1.5.0** (2026-10-28) — Send log (every talking-point email, who/to whom/when/result, under each brief and in Admin); separate LinkedIn sign-in email from work email; new-lead talking points once a day for every client pipeline; Settings shows the client's Streak pipeline link (no Streak API key for clients); 12 Social Selling campaigns + client logins; version number.
- **v1.4.0** (2026-10-26) — Send by email via social.gershon.ai relay; Download PDF/HTML; network in common from the client's side; posts, groups, events, call hooks.
- **v1.3.0** (2026-10-26) — Admin: live campaigns with Streak links, Test this campaign, talking-points template in Settings.
- **v1.2.0** (2026-10-22) — Researched briefs published from research/*.json; social effectiveness grade.
- **v1.0.0** (2026-10-20) — First release: LinkedIn sign-in, leads from Streak, briefs, Settings.
