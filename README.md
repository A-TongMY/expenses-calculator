# Expenses Calculator

A personal expenses calculator for monthly income, fixed commitments, Lifestyle estimates, and daily Spending. See remaining income, month-by-month projections, and actual spending against estimates. The Houses page tracks housing loans and repayment schedules; Renovation plans budgets and tracks actual costs and payments per house. Amounts are in MYR.

The app is a static HTML, CSS, and JavaScript frontend with Netlify Functions for sign-in and data access. Expense data is stored privately in Netlify Blobs and is available on devices where you sign in with the single allowed GitHub account. Access is restricted to GitHub user ID `45504842` (A-TongMY).

## Spending and actuals

Spending records dated payments under Lifestyle categories. Add, edit, or delete entries, and filter by month and category. Past and future dates are allowed. Recorded monthly category totals replace that category's estimates in Expenses, Home, and projections; categories without entries retain their estimates. Actual payments are not divided by the category's repeat interval. Removing the last entry for a category/month restores its estimate.

Spending shows the filtered total, entry count, average per calendar day, and category chart. The average uses every day in the selected month, including leap days, not just elapsed days. Home shows the current month across all categories, independently of Spending filters. Actual-versus-estimate comparisons use only recorded category/month pairs and current category names and estimates.

Entry edits open inside their row/card in Spending, Expenses, Houses, and Renovation rather than reusing the Add fields. Add drafts are retained separately. Save/Cancel and successful Add actions do not focus another text/date field or scroll back to Add; keyboard focus returns to a nearby action without scrolling. Invalid submissions still identify the affected field. Dirty edits require confirmation before cancellation or switching editors; Spending filter changes also ask before discarding an edit. If a saved Spending entry moves outside the filters, confirmation stays in the entry list.

In-page actions are icon buttons with accessible labels (➕ Add, ✓ Save, ✕ Cancel, pencil Edit, trash Delete). Rarely used fields sit under **More options**: an Expense's From/Until months and Scenario flag, and a House's bank installment. More options opens automatically when editing an entry that uses those fields or when one of them is invalid.

Each House card shows the contract **Loan term** (for example 420 months). When a bank installment is higher or lower than the standard one, it also shows a **Projected payoff** such as "416 payments · 4 months earlier". Payments made are counted from the calendar, so they read as an estimate, for example "~46 paid (estimated)".

Each entry requires a real date, an existing category, a positive amount up to MYR 1,000,000,000, and a nonblank description of at most 500 characters. Descriptions are trimmed when submitted. Spending is limited to 2,000 entries; backup files remain limited to 2 MiB. Entries must be inside their category's inclusive active months. Renaming a category updates linked entries; deleting a referenced category or shortening its period past an entry is blocked until those entries are moved or deleted.

## Renovation

Select an existing house, then add items with **Add item**: a name, optional notes, and an optional budget and actual cost (at least one is required; zero is allowed). Missing budget means not budgeted, and missing actual cost is unknown rather than zero.

The overview shows **Budget**, **Actual cost**, **Paid**, and **Outstanding** (actual cost minus paid). **Due this month** and **Overdue** appear only when above zero. Each item card shows the same figures, how far actual cost is over or under budget, its monthly plan, and its payments.

Each card has icon buttons to edit the item, add a payment, set a monthly plan, and delete the item. Payments and plans need an actual cost first, so those buttons stay disabled until it is entered. A payment has a date, a positive amount, and a type: **Payment** or **Deposit**. A monthly plan has a first month, a monthly amount, and 1-600 installments. Every edit saves immediately; an invalid edit keeps the form open with an error naming the item and saves nothing.

Payments of type **Payment** are pooled and fill the plan's installments oldest first; deposits reduce outstanding but never cover installments. A remaining installment is due during its month and overdue only after that month ends. Due and overdue are portions of outstanding, not additional costs. Deposits and payments cannot exceed actual cost, and deposits plus the plan total cannot exceed actual cost.

Actual payment dates must be today or earlier in **Asia/Kuala_Lumpur**. Renovation uses this accounting zone in both browser and server; other pages retain their existing date behavior.

Items are edited inside their cards and payments inside their rows; only one editor is open at a time, and switching away from unsaved changes asks first. An unfinished Add item draft is kept while editing. Deleting an item asks for confirmation and removes its payments and plan. A house with renovation items cannot be deleted.

Renovation and Home share the same overview calculations. Home shows a separate panel for each house with renovation items. Renovation does not affect Expenses, Spending, remaining income, mortgage calculations, or projections.

Individual amounts are limited to MYR 1,000,000,000 with at most two decimals; calculations use integer sen. Names are trimmed, nonblank, and at most 80 characters; notes are at most 500 characters. Each renovation list is limited to 2,000 records. Backup files remain limited to 2 MiB.

## Run locally

Requires Node.js `>=20.12.2`.

```sh
npm ci
npm run dev      # Netlify Dev serves the app and Functions locally
npm test         # Node's built-in test runner
npm run test:ui  # prints a loopback-only browser regression test URL
npm run build    # creates the allowlisted static site in dist/
```

Without the Netlify environment variables below, authentication and state endpoints fail closed; the app does not replace remote data with an empty state. Automated tests use mock credentials and storage. Do not enter real expense data in an unconfigured local environment.

For UI regressions, open the URL printed by `npm run test:ui` in a browser. The page displays pass/fail results using the real forms and page modules with synthetic data only; no sign-in or remote account is used. It checks Spending focus and draft preservation, Expenses/Houses edit recovery, Renovation item, payment and plan editing, and all-page control alignment at the current viewport. Reload at phone and desktop widths. For an expanded responsive check, call `runLayoutChecks({ textSize: 24 })` in that page's developer console; the returned `errors` list must be empty. The test page/fixtures are not production assets. Stop the loopback server with Ctrl+C when finished.

Date/month fields use app-controlled box styling while retaining native date pickers. Verify their size and left alignment in iPhone Safari as well as desktop browsers; a narrow desktop viewport does not emulate iOS native date rendering.

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

Normal **Export** and **Import** actions are on Home only. Keep exported files private: they contain your expense data. Import is an optional, confirmed whole-account replacement; manual entries auto-save without importing or exporting. Export does not change saved data. A failed save leaves the newest changes available in the current tab for export and retry, including after session expiry.

New backups use schema version 9 and include Spending plus renovation items and payments. Schema-8 backups are upgraded by dropping renovation categories and installment links; a deposit that was linked to an installment becomes a payment, so it keeps covering installments. Schema-7 backups preserve Spending and initialize Renovation empty. Supported versions 1-6 retain income, commitments, Lifestyle categories, and houses, initialize Spending/Renovation empty, and deliberately discard old check-ins with a notice. Check-ins never become daily entries or actuals. Loading an older remote record upgrades it in memory without writing; the next normal save persists the upgraded snapshot. Opt-in browser migration leaves the original browser copy unchanged. Invalid renovation references or financial data are rejected rather than silently cleared.

### Last-write-wins saves

Ordinary `PUT /api/state` requests send `{ backup }` and unconditionally replace the whole account snapshot. No storage version is required to load or save. Authentication, same-origin checks, payload limits, backup validation, and schema upgrades still apply. Successful saves must return HTTP 200 with `{ ok: true }`; malformed acknowledgements remain visible save failures.

A single-tab queue serializes writes and coalesces pending edits into the newest snapshot. An import waits behind any in-flight save; edits after import follow it in order. On failure, the newest unsaved snapshot is retained. Clicking **Retry save**, making another edit, or importing again attempts that newest state without a version preflight or a queue reset. There is no application-level automatic retry loop; the Blobs SDK can retry transient transport failures. A newer edit queued during a failed in-flight save still receives its scheduled attempt.

**Trade-off:** last-write-wins means storage arrival order, not newest human intent. Different tabs/devices, delayed requests, or retries can silently replace newer data with an older snapshot. The single-tab queue reduces overlapping writes but does not coordinate clients or eliminate ambiguous network outcomes. This is an intentional personal-app policy; see [the decision record](docs/adr/0001-last-write-wins-account-saves.md). Backup schema versions remain necessary and are unrelated to storage concurrency tokens.

The one-time legacy browser migration remains create-only: it sends `{ backup, writeCondition: { onlyIfNew: true } }` plus `If-None-Match: *`, and cannot replace an existing account. Explicit Import is not migration and can replace existing data. For compatibility with already-open older clients, the API still accepts explicit JSON/header ETag conditions, rejects malformed/conflicting conditions with `400 invalid_write_condition`, and returns `409 state_conflict` if a supplied condition fails. Successful GET/PUT responses retain exact Blobs `stateVersion` and HTTP `ETag` metadata for those clients; the current browser does not use them. Refresh old tabs after deployment to use the new save policy. New condition-free clients require this updated API; deploy the browser and Function together.

If an import displays in the app but saving fails, the visible data is only in the current tab until a save succeeds. Export a recovery backup before refreshing. A `404 state_not_found` from GET is normal for an empty account; a failed PUT is not. Check its response status and error code in the browser Network panel without sharing backup contents or authentication cookies.

## Hosting support

This repository supports deployment through Netlify, including its Functions and Blobs integration. GitHub Pages, Railway, and other static or server hosts do not provide the configured authentication and storage backend.
