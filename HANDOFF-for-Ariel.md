# Talking Points: 3 secret keys for Ariel ❌

Updated 2026-10-26. The app now deploys straight from GitHub to Cloudflare Pages (no Cloudflare API token, no GitHub secrets).
Database, internal passwords and client IDs are all handled. The only thing left is pasting 3 secret keys — Claude can't type secret keys into forms, so this is for a person.

**Where:** Cloudflare dashboard → Workers & Pages → **gershon-talkingpoints** → Settings → **Variables and Secrets** → Add → type **Secret** (Production), one per row. Then Deployments → latest → **Retry deployment** (or tell Claude, who will redeploy).

| # | Secret name | Where the value comes from |
|---|---|---|
| 1 | `LINKEDIN_CLIENT_SECRET` | https://www.linkedin.com/developers/apps/266625528/auth → **TalkingPoints** app → Primary Client Secret (copy icon). |
| 2 | `GOOGLE_CLIENT_SECRET` | Google Cloud → project **Talking Points** (`talking-points-512415`) → Google Auth Platform → Clients → *talkingpoints.gershon.ai* → **Add secret**, copy it. |
| 3 | `RESEND_API_KEY` | https://resend.com/api-keys → key for gershon.ai (or create one with Sending access). Email is off until Olivier approves the format, so this one can come last. |

Optional (financials in briefs): `PAPPERS_API_KEY` (pappers.fr), `COMPANIES_HOUSE_API_KEY` (developer.company-information.service.gov.uk).

No longer needed: `CLOUDFLARE_API_TOKEN` and all GitHub repository secrets (the old ones can stay, nothing reads them).

Done by Claude ✅ (2026-10-26): D1 `talkingpoints-db` created; app applies its own schema + seed and creates its own session/webhook/ingest passwords in D1; LinkedIn + Google client IDs in `wrangler.toml`; hourly GitHub job authenticates with GitHub OIDC (no secret).

When done, tell Olivier "Talking Points keys are in". Claude then redeploys and tests sign-in.
