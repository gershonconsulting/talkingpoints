# Talking Points app: setup (status 2026-10-22)

The repository **github.com/gershonconsulting/talkingpoints** holds all the code. Every push to `main` deploys automatically, as with Linalysis.
Remaining secret keys: see **HANDOFF-for-Ariel.md**.

## 1. LinkedIn ✅
Talking Points uses its **own** LinkedIn app, **"TalkingPoints"** (Client ID `78b871bbkd4wyu`, https://www.linkedin.com/developers/apps/266625528/auth), not the "Client" app.
- ✅ Redirect URL `https://talkingpoints.gershon.ai/api/auth/linkedin/callback` is set.
- ✅ Product **"Sign In with LinkedIn using OpenID Connect"** added; scopes `openid profile email` are granted.

## 2. Google
A **dedicated Google Cloud project "Talking Points"** (`talking-points-512415`, on oattia@gmail.com) so nothing touches the GershonAI / Social GershonCRM consent screen.
- ✅ Google Calendar API enabled.
- ✅ Consent screen "Talking Points", External, support email oattia@gmail.com.
- ✅ Branding: home `https://talkingpoints.gershon.ai`, privacy `/privacy.html`, terms `/terms.html` (pages pushed to `public/`), authorized domain `gershon.ai`.
- ✅ Scopes: `openid`, `userinfo.email`, `calendar.readonly` (matches `functions/_google.js`).
- ✅ OAuth web client "talkingpoints.gershon.ai", redirect `https://talkingpoints.gershon.ai/api/google/callback`.
  Client ID: `905961246921-42hr3jfob0mkolb9798pic2cdqnag1ep.apps.googleusercontent.com`
- ✅ Test users (kept): oattia@gmail.com, olivier@gershonconsulting.com, aina.rama@gershonconsulting.com, dmitri.petratchenko@valos.it.
- ✅ **Published: "In production"** (2026-10-22). Any Google account can connect, up to 100 users. Users see Google's "unverified app" screen (Advanced → Go to Talking Points) until verification.
- ❌ *(later)* Submit for verification (Verification Center) once the site is live, to remove the "unverified app" screen.
- ❌ **Client secret:** not stored. Clients → talkingpoints.gershon.ai → **Add secret** → GitHub `GOOGLE_CLIENT_SECRET` (in Ariel's handoff).

## 3. GitHub secrets
| Secret | Status | Value |
|---|---|---|
| `LINKEDIN_CLIENT_ID` | ✅ set | `78b871bbkd4wyu` |
| `GOOGLE_CLIENT_ID` | ✅ set | see step 2 |
| `CLOUDFLARE_API_TOKEN` | ❌ | see HANDOFF-for-Ariel.md |
| `CLOUDFLARE_ACCOUNT_ID` | ❌ | see HANDOFF-for-Ariel.md |
| `LINKEDIN_CLIENT_SECRET` | ❌ | see HANDOFF-for-Ariel.md |
| `GOOGLE_CLIENT_SECRET` | ❌ | see HANDOFF-for-Ariel.md |
| `RESEND_API_KEY` | ❌ | see HANDOFF-for-Ariel.md |
| `PAPPERS_API_KEY` *(optional)* | ❌ | pappers.fr |
| `COMPANIES_HOUSE_API_KEY` *(optional)* | ❌ | Companies House |

## 4. Run the deploy ❌ (after step 3)
1. **Actions → "Deploy talkingpoints.gershon.ai" → Run workflow**.
2. If the log line `dns:` says the token can't see the zone, add in Cloudflare (zone **gershon.ai**) **CNAME `talkingpoints` → the printed pages subdomain**, proxied. Do **not** use `talkingpoints.pages.dev` (someone else's).
3. "Hourly: new leads and meeting talking points" then runs by itself every hour.

## Check ❌
1. Open https://talkingpoints.gershon.ai → **Sign in with LinkedIn**. Olivier's accounts are already admins on Valos.
2. **Settings**: paste the Streak API key, pick "Valos - LG", connect Google Calendar.
3. Claude then tests the Valos leads end to end.
