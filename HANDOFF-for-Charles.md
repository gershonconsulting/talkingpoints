# Talking Points app: setup for Charles (one time, about 20 minutes)

The repository **github.com/gershonconsulting/talkingpoints** exists, and Claude has already pushed all the code to it. Every push to `main` deploys automatically, as with Linalysis. Four steps are left, and they all need someone signed in to a dashboard.

## 1. LinkedIn: allow the Talking Points sign-in address
1. Go to LinkedIn Developers → app **"Client"** (ID `78up2kwkdki2kh`, https://www.linkedin.com/developers/apps/266622603/auth).
2. Under **Authorized redirect URLs**, click the pencil, add `https://talkingpoints.gershon.ai/api/auth/linkedin/callback`, then **Update**. Keep the existing client.gershon.ai address: both apps share this LinkedIn app.

## 2. Google: create the "Connect Google Calendar" access
1. In Google Cloud Console, use the Gershon project on **oattia@gmail.com**. Go to **APIs & Services**:
   - **Library**: enable **Google Calendar API**.
   - **OAuth consent screen**: External, app name "Talking Points", support email olivier@gershonconsulting.com. Add the scope `.../auth/calendar.readonly`, then **Publish app**.
   - **Credentials** → Create credentials → OAuth client ID → **Web application**:
     - Authorized redirect URI: `https://talkingpoints.gershon.ai/api/google/callback`
2. Copy the **Client ID** and **Client secret** for step 3.

## 3. GitHub secrets
In the **talkingpoints** repo, go to **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | same value as in the **linalysis** repo |
| `CLOUDFLARE_ACCOUNT_ID` | same value as in the **linalysis** repo |
| `LINKEDIN_CLIENT_ID` | `78up2kwkdki2kh` |
| `LINKEDIN_CLIENT_SECRET` | Primary Client Secret of the "Client" LinkedIn app (the same value client.gershon.ai uses) |
| `RESEND_API_KEY` | Resend → API Keys (gershon.ai) |
| `GOOGLE_CLIENT_ID` | from step 2 |
| `GOOGLE_CLIENT_SECRET` | from step 2 |
| `PAPPERS_API_KEY` *(optional)* | pappers.fr API, for French company financials |
| `COMPANIES_HOUSE_API_KEY` *(optional)* | free key from developer.company-information.service.gov.uk, for UK financials |

You don't need to set a Streak key. Each client connects its own Streak in the app's **Settings** page.

## 4. Run the deploy
1. Go to **Actions → "Deploy talkingpoints.gershon.ai" → Run workflow**. It sets up the database and the site, loads the keys, deploys, and attaches the domain.
2. If its log line `dns:` says the token can't see the zone, add this record in Cloudflare, zone **gershon.ai**: **CNAME `talkingpoints` → `talkingpoints.pages.dev`**, proxied.
3. The workflow "Hourly: new leads and meeting talking points" then runs by itself every hour.

## Check
1. Open https://talkingpoints.gershon.ai and click **Sign in with LinkedIn**. Olivier's accounts are already admins on Valos.
2. Go to **Settings** and paste the Streak API key, pick the "Valos - LG" pipeline, and connect Google Calendar.
