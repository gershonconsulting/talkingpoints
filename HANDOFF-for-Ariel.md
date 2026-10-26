# Talking Points: 4 GitHub secrets for Ariel ❌

Claude set up LinkedIn, Google, the two client IDs and the Cloudflare account ID. The only thing left before the first deploy is pasting 4 secret keys. Claude can't type secret keys into forms, so this is for a person.

Where: https://github.com/gershonconsulting/talkingpoints/settings/secrets/actions → **New repository secret** (one per row).

| # | Secret name | Where the value comes from |
|---|---|---|
| 1 | `CLOUDFLARE_API_TOKEN` | Same token the **linalysis** repo uses (Cloudflare → My Profile → API Tokens; if you can't read the old one, create a new token with *Cloudflare Pages: Edit*, *D1: Edit*, and *Zone DNS: Edit* on gershon.ai). |
| 2 | `LINKEDIN_CLIENT_SECRET` | https://www.linkedin.com/developers/apps/266625528/auth → **TalkingPoints** app → Primary Client Secret (copy icon). Not the "Client" app. |
| 3 | `GOOGLE_CLIENT_SECRET` | Google Cloud → project **Talking Points** (`talking-points-512415`) → Google Auth Platform → Clients → *talkingpoints.gershon.ai* → **Add secret**, copy it. |
| 4 | `RESEND_API_KEY` | https://resend.com/api-keys → key for gershon.ai (or create one with Sending access). |

Optional (financials in briefs): `PAPPERS_API_KEY` (pappers.fr), `COMPANIES_HOUSE_API_KEY` (developer.company-information.service.gov.uk).

Already set ✅: `LINKEDIN_CLIENT_ID`, `GOOGLE_CLIENT_ID`, `CLOUDFLARE_ACCOUNT_ID` (2026-10-26).

When done, tell Olivier "Talking Points keys are in". Claude then runs **Actions → Deploy talkingpoints.gershon.ai**, fixes DNS if needed and tests sign-in.
