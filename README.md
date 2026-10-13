# Expenses Calculator

A personal expenses calculator for monthly income, fixed commitments, and varying lifestyle spending. See best-to-worst monthly estimates, month-by-month projections, and check-ins against actual spending. The Houses page tracks housing loans and repayment schedules. Amounts are in MYR.

The app is a static HTML, CSS, and JavaScript frontend with Netlify Functions for sign-in and data access. Expense data is stored privately in Netlify Blobs and is available on devices where you sign in with the single allowed GitHub account. Access is restricted to GitHub user ID `45504842` (A-TongMY).

## Run locally

Requires Node.js `>=20.12.2`.

```sh
npm ci
npm run dev      # Netlify Dev serves the app and Functions locally
npm test         # Node's built-in test runner
npm run build    # creates the allowlisted static site in dist/
```

Without the Netlify environment variables below, authentication and state endpoints fail closed; the app does not replace remote data with an empty state. Automated tests use mock credentials and storage. Do not enter real expense data in an unconfigured local environment.

## Deploy to Netlify

Netlify is the supported hosting and storage provider. Connect this repository to a Netlify site and deploy from the production branch. The included `netlify.toml` configures `npm run build`, publishes `dist/`, and deploys the Functions in `netlify/functions/`.

### Configure GitHub sign-in

1. In GitHub, create an OAuth App under **Settings → Developer settings → OAuth Apps**. Set its **Authorization callback URL** to `https://your-site.example/api/auth/callback`, replacing the origin with the exact production `PUBLIC_SITE_URL`. The app requests only the `read:user` scope.
2. In Netlify's site environment-variable settings, add the five values below for the Functions runtime. Keep the client secret and session secret private; do not put secrets in source files, commit them, or expose them in browser code.

| Variable | Value |
| --- | --- |
| `GITHUB_OAUTH_CLIENT_ID` | Client ID from the GitHub OAuth App |
| `GITHUB_OAUTH_CLIENT_SECRET` | Client secret from the GitHub OAuth App |
| `GITHUB_ALLOWED_USER_ID` | `45504842` |
| `SESSION_SECRET` | A newly generated secret of at least 32 bytes |
| `PUBLIC_SITE_URL` | The canonical HTTPS origin of the production Netlify site, with no trailing slash |

To generate a session secret locally, run:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Copy the output directly into Netlify's `SESSION_SECRET` setting. Do not save it in the repository. The configured callback URL is `${PUBLIC_SITE_URL}/api/auth/callback`.

The allowlist uses GitHub's stable numeric user ID, not a changeable login name. To confirm an account's ID, open `https://api.github.com/users/A-TongMY` and read the `id` field; only `45504842` is authorized by this application.

### Disable Deploy Previews

Disable Netlify Deploy Previews in the site's deploy settings. Netlify Blobs storage is site-wide, so preview deploys would use the same private data store as production. Keep production deploys on the canonical site origin configured by `PUBLIC_SITE_URL`.

## Data migration and backups

After signing in, the app checks the remote account before loading data. If the remote account is empty and this browser contains a valid legacy backup, the app offers a one-time migration. Migration is opt-in and creates the remote state only if it is still empty. Choosing not to migrate starts with an empty remote account. Your existing browser data is not automatically deleted or modified by migration.

Use **Export backup** to keep a private copy or **Import backup** to restore data to the signed-in account. Keep exported files private: they contain your expense data. A failed save leaves changes available in the current tab for export and retry; a stale save is reported rather than silently overwriting a newer remote copy.

## Hosting support

This repository supports deployment through Netlify, including its Functions and Blobs integration. GitHub Pages, Railway, and other static or server hosts do not provide the configured authentication and storage backend.
