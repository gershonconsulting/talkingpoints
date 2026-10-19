# Talking Points app: setup for Charles (one time, about 15 minutes)

The app code for **talkingpoints.gershon.ai** is finished. It deploys itself on every push, the same way Linalysis does. Claude couldn't create the GitHub repository because the GitHub connector has no permission to create repos, and the Chrome browser isn't signed in to GitHub. Please do these steps:

## 1. Create the repository
- Signed in as **gershonconsulting** on github.com, create a **private** repo named **`talkingpoints`**.
- Leave it empty: no README.
- Then upload the contents of `Documents\Claude\Projects\talking.gershon.ai\app\`, keeping its folders (`functions/`, `public/`, `.github/workflows/`). Upload to the `main` branch.
  - The deploy workflow is saved as `app\deploy-workflow.yml`, because hidden `.github` folders can't be written to that folder. In the repo, use "Add file → Create new file", name it `.github/workflows/deploy.yml`, and paste in the content of `deploy-workflow.yml`.

## 2. Add the repository secrets
Go to GitHub, then **talkingpoints → Settings → Secrets and variables → Actions → New repository secret**, and add:

| Secret | Where to get it |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Same value as in the **linalysis** repo |
| `CLOUDFLARE_ACCOUNT_ID` | Same value as in the **linalysis** repo |
| `LINKEDIN_CLIENT_ID` | LinkedIn Developers → the app with redirect `https://talkingpoints.gershon.ai/api/auth/linkedin/callback` → Auth tab |
| `LINKEDIN_CLIENT_SECRET` | Same place (Primary Client Secret) |
| `STREAK_API_KEY` | Streak → Integrations → API key. Use the Gershon account that sees the "- LG" pipelines |
| `RESEND_API_KEY` | Resend → API Keys (gershon.ai domain) |
| `PAPPERS_API_KEY` *(optional)* | pappers.fr API, for French company financials |
| `COMPANIES_HOUSE_API_KEY` *(optional)* | developer.company-information.service.gov.uk (free), for UK financials |

On the LinkedIn app's **Products** tab, check that **"Sign In with LinkedIn using OpenID Connect"** is added.

## 3. Run the deploy
Go to **Actions → "Deploy talkingpoints.gershon.ai" → Run workflow**. It runs these steps itself:
- creates the database
- creates the Cloudflare Pages project
- loads the secrets
- deploys the site
- attaches the domain
- registers the Streak alerts for new leads

If the log line `dns:` says the token can't see the zone, add this record in the Cloudflare dashboard, in the **gershon.ai** zone: **CNAME `talkingpoints` → `talkingpoints.pages.dev`** (proxied).

## 4. Check
Open https://talkingpoints.gershon.ai: the home page should load. Then click **Sign in with LinkedIn**. Olivier's accounts (oattia@gmail.com and olivier@gershonconsulting.com) are already set up as admins on the Valos view.
