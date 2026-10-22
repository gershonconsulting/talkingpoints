# Talking Points app: setup for Charles (one time, about 20 minutes)

The repository **github.com/gershonconsulting/talkingpoints** exists, and Claude has already pushed all the code to it. Every push to `main` deploys automatically, as with Linalysis. Four steps are left, and they all need someone signed in to a dashboard.

## 1. LinkedIn ✅ (done 2026-10-22)
Talking Points uses its **own** LinkedIn app, **"TalkingPoints"** (Client ID `78b871bbkd4wyu`, https://www.linkedin.com/developers/apps/266625528/auth), not the "Client" app.
- ✅ Authorized redirect URL `https://talkingpoints.gershon.ai/api/auth/linkedin/callback` is set.
- ✅ Product **"Sign In with LinkedIn using OpenID Connect"** added, so scopes `openid profile email` are granted (needed by `/api/auth/linkedin/start`).

## 2. Google: create the "Connect Google Calendar" access ❌
1. In Google Cloud Console, use the Gershon project on **oattia@gmail.com**. Go to **APIs & Services**:
   - **Library**: enable **Google Calendar API**.
   - **OAuth consent screen**: External, app name "Talking Points", support email olivier@gershonconsulting.com. Add the scope `.../auth/calendar.readonly`, then **Publish app**.
   - **Credentials** → Create credentials → OAuth client ID → **Web application**:
     - Authorized redirect URI: `https://talkingpoints.gershon.ai/api/google/callback`
2. Copy the **Client ID** and **Client secret** for step 3.

## 3. GitHub secrets ❌
In the **talkingpoints** repo, go to **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | same value as in the **linalysis** repo |
| `CLOUDFLARE_ACCOUNT_ID` | same value as in the **linalysis** repo |
| `LINKEDIN_CLIENT_ID` | `78b871bbkd4wyu` (TalkingPoints LinkedIn app) |
| `LINKEDIN_CLIENT_SECRET` | Primary Client Secret of the **TalkingPoints** LinkedIn app (Auth tab, app 266625528) |
| `RESEND_API_KEY` | Resend → API Keys (gershon.ai) |
| `GOOGLE_CLIENT_ID` | from step 2 |
| `GOOGLE_CLIENT_SECRET` | from step 2 |
| `PAPPERS_API_KEY` *(optional)* | pappers.fr API, for French company financials |
| `COMPANIES_HOUSE_API_KEY` *(optional)* | free key from developer.company-information.service.gov.uk, for UK financials |

You don't need to set a Streak key. Each client connects its own Streak in the app's **Settings** page.

## 4. Run the deploy ❌
1. Go to **Actions → "Deploy talkingpoints.gershon.ai" → Run workflow**. It sets up the database and the site, loads the keys, deploys, and attaches the domain.
2. The log prints `pages subdomain: …` (something like `gershon-talkingpoints.pages.dev`). If the line `dns:` says the token can't see the zone, add this record in Cloudflare, zone **gershon.ai**: **CNAME `talkingpoints` → that subdomain**, proxied. Do **not** use `talkingpoints.pages.dev`; that one belongs to someone else.
3. The workflow "Hourly: new leads and meeting talking points" then runs by itself every hour.

## Check ❌
1. Open https://talkingpoints.gershon.ai and click **Sign in with LinkedIn**. Olivier's accounts are already admins on Valos.
2. Go to **Settings** and paste the Streak API key, pick the "Valos - LG" pipeline, and connect Google Calendar.
3. Tell Claude when it's live, so it can test the Valos leads end to end.
