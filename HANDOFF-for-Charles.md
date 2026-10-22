# Talking Points app: setup (status 2026-10-22)

The repository **github.com/gershonconsulting/talkingpoints** holds all the code. Every push to `main` deploys automatically, as with Linalysis.

## 1. LinkedIn ✅
Talking Points uses its **own** LinkedIn app, **"TalkingPoints"** (Client ID `78b871bbkd4wyu`, https://www.linkedin.com/developers/apps/266625528/auth), not the "Client" app.
- ✅ Redirect URL `https://talkingpoints.gershon.ai/api/auth/linkedin/callback` is set.
- ✅ Product **"Sign In with LinkedIn using OpenID Connect"** added; scopes `openid profile email` are granted.

## 2. Google ✅ (in Testing mode)
A **dedicated Google Cloud project "Talking Points"** (`talking-points-512415`, on oattia@gmail.com) was created so nothing touches the GershonAI / Social GershonCRM consent screen.
- ✅ Google Calendar API enabled.
- ✅ Consent screen "Talking Points", External, support email oattia@gmail.com (olivier@gershonconsulting.com isn't a member of that Google account, so it couldn't be selected).
- ✅ Scopes: `openid`, `userinfo.email`, `calendar.readonly` (matches `functions/_google.js`).
- ✅ OAuth web client "talkingpoints.gershon.ai", redirect `https://talkingpoints.gershon.ai/api/google/callback`.
  Client ID: `905961246921-42hr3jfob0mkolb9798pic2cdqnag1ep.apps.googleusercontent.com`
- ✅ Test user: oattia@gmail.com.
- ❌ **Publish app** is greyed out until Branding has a home page + privacy policy URL + authorized domain `gershon.ai`. Until published, only listed test users can connect a calendar (add Valos users as test users, or publish).
- ❌ **Client secret:** Google shows it only once and it was not stored. Open the client (Google Auth Platform → Clients → talkingpoints.gershon.ai) → **Add secret**, and put that value in GitHub as `GOOGLE_CLIENT_SECRET`.

## 3. GitHub secrets
Repo **Settings → Secrets and variables → Actions**:

| Secret | Status | Value |
|---|---|---|
| `LINKEDIN_CLIENT_ID` | ✅ set | `78b871bbkd4wyu` |
| `GOOGLE_CLIENT_ID` | ✅ set | see step 2 |
| `CLOUDFLARE_API_TOKEN` | ❌ | same value as in the **linalysis** repo |
| `CLOUDFLARE_ACCOUNT_ID` | ❌ | same value as in the **linalysis** repo |
| `LINKEDIN_CLIENT_SECRET` | ❌ | Primary Client Secret of the **TalkingPoints** LinkedIn app (Auth tab, app 266625528) |
| `GOOGLE_CLIENT_SECRET` | ❌ | new secret from step 2 |
| `RESEND_API_KEY` | ❌ | Resend → API Keys (gershon.ai) |
| `PAPPERS_API_KEY` *(optional)* | ❌ | pappers.fr API, French company financials |
| `COMPANIES_HOUSE_API_KEY` *(optional)* | ❌ | developer.company-information.service.gov.uk, UK financials |

No Streak key is needed: each client connects its own Streak in **Settings**.
Note: Claude does not type secret keys into forms, so a person has to paste the ❌ rows above.

## 4. Run the deploy ❌ (after step 3)
1. **Actions → "Deploy talkingpoints.gershon.ai" → Run workflow**. It sets up the database and the site, loads the keys, deploys, and attaches the domain.
2. The log prints `pages subdomain: …`. If the line `dns:` says the token can't see the zone, add in Cloudflare (zone **gershon.ai**) **CNAME `talkingpoints` → that subdomain**, proxied. Do **not** use `talkingpoints.pages.dev`; that one belongs to someone else.
3. "Hourly: new leads and meeting talking points" then runs by itself every hour.

## Check ❌
1. Open https://talkingpoints.gershon.ai and click **Sign in with LinkedIn**. Olivier's accounts are already admins on Valos.
2. In **Settings**, paste the Streak API key, pick the "Valos - LG" pipeline, and connect Google Calendar.
3. Tell Claude when it's live so it can test the Valos leads end to end.
