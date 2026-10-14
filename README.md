# Expenses Calculator

A personal expenses calculator for monthly income, fixed commitments, Lifestyle estimates, and daily Spending. See remaining income, month-by-month projections, and actual spending against estimates. The Houses page tracks housing loans and repayment schedules. Amounts are in MYR.

The app is a static HTML, CSS, and JavaScript frontend with Netlify Functions for sign-in and data access. Expense data is stored privately in Netlify Blobs and is available on devices where you sign in with the single allowed GitHub account. Access is restricted to GitHub user ID `45504842` (A-TongMY).

## Spending and actuals

Spending records dated payments under Lifestyle categories. Add, edit, or delete entries, and filter by month and category. Past and future dates are allowed. Recorded monthly category totals replace that category's estimates in Expenses, Home, and projections; categories without entries retain their estimates. Actual payments are not divided by the category's repeat interval. Removing the last entry for a category/month restores its estimate.

Spending shows the filtered total, entry count, average per calendar day, and category chart. The average uses every day in the selected month, including leap days, not just elapsed days. Home shows the current month across all categories, independently of Spending filters. Actual-versus-estimate comparisons use only recorded category/month pairs and current category names and estimates.

Each entry requires a real date, an existing category, a positive amount up to MYR 1,000,000,000, and a nonblank description of at most 500 characters. Descriptions are trimmed when submitted. Spending is limited to 2,000 entries; backup files remain limited to 2 MiB. Entries must be inside their category's inclusive active months. Renaming a category updates linked entries; deleting a referenced category or shortening its period past an entry is blocked until those entries are moved or deleted.

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

Normal **Export** and **Import** actions are on Home only. Keep exported files private: they contain your expense data. A failed save leaves changes available in the current tab for export and retry; a stale save is reported rather than silently overwriting a newer remote copy. Recovery exports remain available after save failures, conflicts, and session expiry.

New backups use schema version 7 and include Spending. Supported older backups retain income, commitments, Lifestyle categories, and houses, initialize Spending empty, and deliberately discard old check-ins with a notice. Check-ins never become daily entries or actuals. Loading an older remote record upgrades it in memory without writing; its original ETag is retained for the next normal conditional save. Opt-in browser migration leaves the original browser copy unchanged.

### Conditional saves

`PUT /api/state` sends `{ backup, writeCondition }`. The condition is exactly `{ onlyIfNew: true }` for an empty account or `{ etag: "<last loaded or saved ETag>" }` for an update. It is carried in JSON so saves do not depend on an intermediary forwarding the standard `If-None-Match`/`If-Match` request headers. These headers are also sent for compatibility; the Function accepts header-only clients, but rejects conflicting or malformed conditions with `400 invalid_write_condition`. Requests with no condition return `428 write_condition_required`. All accepted saves still use atomic conditional Blobs writes, and competing creates or stale updates return `409 state_conflict`.

If an import displays in the app but saving fails, the visible data is only in the current tab until a save succeeds. Export a recovery backup before refreshing. A `404 state_not_found` from GET is normal for an empty account; a failed PUT is not. Check its response status and error code in the browser Network panel without sharing backup contents or authentication cookies.

## Hosting support

This repository supports deployment through Netlify, including its Functions and Blobs integration. GitHub Pages, Railway, and other static or server hosts do not provide the configured authentication and storage backend.
