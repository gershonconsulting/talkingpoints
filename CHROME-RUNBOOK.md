# Talking Points: go-live runbook (updated 2026-10-26)

The old runbook (GitHub secrets + "Deploy" workflow + Cloudflare API token) is **obsolete**.
Deploys now go through Cloudflare Pages' GitHub connection; nothing needs an API token.

Status and remaining steps:
- **HANDOFF-for-Charles.md**: what is set up in LinkedIn, Google and Cloudflare.
- **HANDOFF-for-Ariel.md**: the 3 secret keys a person pastes in Cloudflare.

Once the keys are in and talkingpoints.gershon.ai resolves:
1. Cloudflare → gershon-talkingpoints → Deployments → **Retry deployment** on the latest one (secrets apply on the next deploy).
2. GitHub → Actions → "Hourly — new leads and meeting talking points" → **Run workflow**; the log ends with a JSON report for `valos`.
3. Olivier tests: sign in with LinkedIn, Settings → Streak key + "Valos - LG", connect Google Calendar, create a draft for a Valos lead.
