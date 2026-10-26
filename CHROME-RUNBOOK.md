# Talking Points: go-live runbook for Claude in Chrome

**For:** Claude in Chrome (the browser extension), working in Olivier's **"Oattia"** Chrome profile.
**Goal:** get https://talkingpoints.gershon.ai live and ready for Olivier to test, Valos included.
**Repo:** https://github.com/gershonconsulting/talkingpoints (status as of 2026-10-26)

> **The one rule about keys.** Claude, in Chrome or anywhere else, does not type or paste secret keys, passwords or tokens into web forms. For each of the 4 keys in step 2, the extension opens and prepares everything: the page where the key comes from, and the GitHub "New secret" form with its name already filled in. **Olivier then copies the value, pastes it and clicks "Add secret".** That takes 4 copy-pastes, about 3 minutes. The extension does everything else on its own.

---

## Already done ✅ (don't redo)
| Item | Detail |
|---|---|
| Code | Every page and feature is in the repo; any push to `main` deploys automatically |
| LinkedIn app | **"TalkingPoints"**, Client ID `78b871bbkd4wyu`, https://www.linkedin.com/developers/apps/266625528/auth. Sign-in address and the OpenID product are set |
| Google project | **"Talking Points"** (`talking-points-512415`, on oattia@gmail.com). Calendar API on, consent screen published, web client created |
| GitHub secrets already set | `LINKEDIN_CLIENT_ID`, `GOOGLE_CLIENT_ID`, `CLOUDFLARE_ACCOUNT_ID` |
| Pages project name | `gershon-talkingpoints`. **Never** use `talkingpoints.pages.dev`: it belongs to someone else |

---

## Step 1: Check the current state
1. Open https://github.com/gershonconsulting/talkingpoints/settings/secrets/actions.
   - If GitHub asks to sign in, stop and tell Olivier: *"GitHub needs you to sign in as gershonconsulting in this Chrome."*
2. Write down which of these 4 names are **missing**: `CLOUDFLARE_API_TOKEN`, `LINKEDIN_CLIENT_SECRET`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`. Step 2 only covers the missing ones.

## Step 2: Prepare the 4 keys (Olivier pastes)
For each missing key, open **two tabs side by side**:
- **Tab A:** where the value comes from.
- **Tab B:** https://github.com/gershonconsulting/talkingpoints/settings/secrets/actions/new with the **Name** field already filled in.

Then tell Olivier, by voice alert if the "Claude Alerts" tab is armed:
*"Olivier, I need you now. Project: Talking Points. Task: copy the key from the left tab, paste it into the right tab, click Add secret."*

Wait until the secret shows in the list, then move to the next key.

| # | Name (Tab B) | Tab A: where the value comes from |
|---|---|---|
| 1 | `CLOUDFLARE_API_TOKEN` | https://dash.cloudflare.com/profile/api-tokens → **Create Token** → **Custom token**, named "talkingpoints-deploy", with permissions **Account › Cloudflare Pages › Edit**, **Account › D1 › Edit**, **Account › Workers AI › Read**, and **Zone › DNS › Edit** on zone **gershon.ai**. The extension fills all of this in and clicks **Create**. The token is shown once; Olivier copies it from there. |
| 2 | `LINKEDIN_CLIENT_SECRET` | https://www.linkedin.com/developers/apps/266625528/auth → the **TalkingPoints** app (not "Client") → Primary Client Secret → copy icon. |
| 3 | `GOOGLE_CLIENT_SECRET` | https://console.cloud.google.com/auth/clients?project=talking-points-512415 → client *talkingpoints.gershon.ai* → **Add secret**, which the extension clicks. The secret is shown once; Olivier copies it. |
| 4 | `RESEND_API_KEY` | https://resend.com/api-keys → **Create API key**, named "talkingpoints", **Sending access**, domain **gershon.ai**. The extension fills this in and clicks Create; Olivier copies the key. |

Optional, only if Olivier wants company financials in the briefs: `PAPPERS_API_KEY` (pappers.fr → API) and `COMPANIES_HOUSE_API_KEY` (developer.company-information.service.gov.uk, free).

## Step 3: Deploy (extension)
1. Open https://github.com/gershonconsulting/talkingpoints/actions/workflows/deploy.yml → **Run workflow** → branch `main` → **Run workflow**.
2. Open the run and wait until it finishes, about 2 minutes. Check the log:
   - **Check secrets** passes.
   - **Database**, **Deploy** and **Custom domain** are green.
   - Note the line `pages subdomain: …`, for example `gershon-talkingpoints.pages.dev`.
   - Note the line `dns:`.
3. If the run fails, copy the red error lines and give them to Olivier. Don't retry more than once.

## Step 4: Domain (extension, only if needed)
If the `dns:` line says the token can't see the zone:
1. Open https://dash.cloudflare.com → zone **gershon.ai** → **DNS** → **Add record**.
2. Fill in: Type **CNAME**, Name **`talkingpoints`**, Target **the pages subdomain from step 3**, Proxy **on**. Then **Save**.
3. Open https://talkingpoints.gershon.ai. The home page ("Know what you share with every lead…") should load within a few minutes.

## Step 5: Turn on the new-lead alerts (extension)
Open https://github.com/gershonconsulting/talkingpoints/actions/workflows/cron.yml → **Run workflow**. The log should end with a JSON report for `valos`. After that, it runs by itself every hour.

## Step 6: Olivier tests (Olivier does each of these)
| # | Test | Expected |
|---|---|---|
| 1 | Open https://talkingpoints.gershon.ai → **Sign in with LinkedIn** (Olivier's own LinkedIn) | The dashboard opens, with "Valos Srl" in the sidebar |
| 2 | **Settings → CRM: Streak**: paste the Streak API key (Gmail → Streak → Integrations → API key) and pick **Valos - LG** → Save | Status shows **Connected**, and Valos leads appear under **Leads** |
| 3 | **Settings → Google Calendar → Connect Google Calendar** → choose oattia@gmail.com. Google may show "unverified app": click Advanced → Go to Talking Points | Status shows **Connected as oattia@gmail.com**; choose the calendar where prospect calls are booked |
| 4 | **Settings → Talking points emails**: enter the recipient emails, choose 48 hours → Save | Toast: "Email settings saved" |
| 5 | **Leads** → click a Valos lead → **Create draft** | A talking-points brief appears in the PEPperPRINT format |
| 6 | **My profile**: paste your background → Save | Better "What you have in common" matches on the next drafts |

Pasting the Streak key in test 2 is also a key paste, so Olivier does it himself.

## Step 7: Report back
The extension posts a short summary in chat, listing what passed and what didn't, and ends with:
- ✅ https://talkingpoints.gershon.ai when steps 1–5 all passed.
- ❌ followed by the exact blocking line when something didn't.

---
**Still off by design:** talking-points emails stay off (`EMAIL_ENABLED = "false"` in `wrangler.toml`) until Olivier approves the final email format. Claude switches them on afterwards with one commit.
