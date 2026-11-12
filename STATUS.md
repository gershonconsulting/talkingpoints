# Talking Points — status (talkingpoints.gershon.ai)
Last updated: 2026-11-12 · version 1.10.0 (branch feat/quick-talking-point)

## Deploy route
Push/merge to `main` → `.github/workflows/deploy.yml` → Cloudflare Pages project `gershon-talkingpoints`.
Bump VERSION, public/version.txt and APP_VERSION in public/app.js together on every release.

## ✅ Done
- v1.9.3 on main: Friday talking points, Admin dashboard, Scheduled-only rule for Gershon pipelines.
- v1.10.0 (PR open): "New talking point" — website or pro email → Cloudflare Workers AI talking point
  (functions/_quick.js, /api/quick, /api/quick/:id, /api/quick/:id/send, table quick_briefs).
  Tested locally: input parsing, website reading (gershonconsulting.com), brief build with mocked AI, rendering.

## ❌ Open
- v1.10.0 merge to main (deploys it) — then a live test with Workers AI on the real site.
- Quick talking points use the website only (no LinkedIn / Streak / registries) — by design, labelled "Quick".
- See CHANGELOG.md and HANDOFF.txt for older open items (recipients for Wallix / Altavia Alexandre, etc.).
