# Talking Points app: setup (status 2026-10-26)

The repository **github.com/gershonconsulting/talkingpoints** holds all the code. Every push to `main` deploys automatically through **Cloudflare Pages' own GitHub connection** (project `gershon-talkingpoints`, since 2026-10-26). No Cloudflare API token and no GitHub secrets are used any more.
Remaining secret keys: see **HANDOFF-for-Ariel.md** (3 left, pasted in Cloudflare, need a person).

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
- ❌ **Client secret:** not stored. Clients → talkingpoints.gershon.ai → **Add secret** → Cloudflare secret `GOOGLE_CLIENT_SECRET` (in Ariel's handoff).

## 3. Cloudflare ✅ (done by Claude 2026-10-26)
- ✅ D1 database `talkingpoints-db` (`a1ac634b-d6f9-469d-b3d5-bc75c882abd4`). The app applies `schema.sql` + `seed.sql` itself on first request.
- ✅ Session / webhook / ingest passwords: created by the app itself and stored in D1 (`app_secrets`). Nobody types them.
- ✅ Client IDs (public) in `wrangler.toml` `[vars]`.
- ✅ Pages project `gershon-talkingpoints` connected to the repo (build command `node scripts/gen-schema.mjs`, output `public`). Live at https://gershon-talkingpoints.pages.dev.
- ❌ Custom domain `talkingpoints.gershon.ai` (CNAME → gershon-talkingpoints.pages.dev): waiting for Olivier's OK on the DNS change.
- ❌ 3 secrets (LinkedIn, Google, Resend): **HANDOFF-for-Ariel.md**. Old GitHub secrets are no longer read.

## 4. Hourly job ✅
`.github/workflows/cron.yml` signs in with a GitHub OIDC token (no secret). It runs every hour once the domain is live.

## Check ❌
1. Open https://talkingpoints.gershon.ai → **Sign in with LinkedIn**. Olivier's accounts are already admins on Valos.
2. **Settings**: paste the Streak API key, pick "Valos - LG", connect Google Calendar.
3. Claude then tests the Valos leads end to end.
