# Netlify Blobs persistence and GitHub sign-in

## Status

Design approved in conversation; written-spec review is pending.

## Context and goals

Expenses Calculator is a static HTML/CSS/JavaScript app. It currently reads
and writes a single validated state document in browser `localStorage`. The
goal is to make the app usable across devices while keeping its financial data
private to one person.

The app will be deployed on Netlify. Only the GitHub account whose current
login is `A-TongMY` may use it. Authorization must be tied to that account's
stable GitHub user ID, not to a Git author name or email. No global or
repository Git identity settings are part of this change.

Existing browser data may be offered for one-time migration only when the
remote store is confirmed empty. The migration must not delete or overwrite
the browser copy. Existing backup export and import remain available.

Netlify Deploy Previews will be disabled to keep preview deployments from
accessing production data.

## Chosen approach

Use Netlify Blobs as the remote store, accessed only by Netlify Functions.
This is a site-wide key/value store, which fits the app's existing single
state document and avoids introducing a relational schema. The app will be
Netlify-only; other hosting targets will not silently fall back to
`localStorage`.

The other considered option was Netlify Database (managed Postgres). It is
appropriate for relational or query-heavy data, but adds a database and its
plan requirements for a single document the app already validates as a unit.

## Architecture and access control

- Serve the static app and Netlify Functions from the same Netlify site.
- Implement GitHub OAuth start, callback, and logout endpoints, plus an
  authenticated state endpoint.
- Keep the OAuth client secret, session-signing secret, and allowed GitHub
  numeric user ID in Netlify environment variables. Never commit these values
  or expose them to browser code.
- In the OAuth callback, exchange the authorization code server-side, fetch
  the GitHub user profile, and compare its stable numeric ID with the configured
  allowlist. Reject every other account. Request no repository permissions.
  Discard the provider access token after identity verification.
- Set a signed, `HttpOnly`, `Secure`, `SameSite=Lax` session cookie. Validate
  the OAuth state value and validate the session on every protected request.
  Reject cross-origin state-changing requests.
- Store the state document in one site-wide Netlify Blobs store under one fixed
  key. The browser never accesses Blobs directly.

## Data flow and migration

1. On app startup, request the current state from the protected function.
   Unauthenticated users see a sign-in action. A network or server error is
   distinct from an empty store and must not initialize blank state.
2. Validate remote content through the existing backup import/validation
   logic before using it.
3. If and only if a successful read confirms the remote key is absent, inspect
   the legacy `localStorage` key. If valid local data exists, offer to migrate
   it. The migration creates the remote key conditionally so concurrent
   initializers cannot replace a value created by another request. Keep the
   local copy unchanged.
4. After the remote state has been loaded or initialized, all app saves go to
   the function API. Do not write ongoing changes to `localStorage`.
5. Preserve manual backup export and import. Imported backup content is
   validated before being submitted to the protected API.

## Save behavior, conflicts, and failures

- Use Netlify Blobs ETags with conditional writes. A write based on a stale
  ETag returns a conflict instead of silently replacing another device's
  newer state.
- On conflict, retain the current in-memory edits, explain that a newer remote
  version exists, and offer recovery by reloading the remote version or
  exporting the current edits. Do not merge or overwrite automatically.
- On authentication, network, or service failure, show an explicit
  unsaved/error state. Never present the change as saved unless the remote
  write succeeds. Keep export available for recovery.
- There is no offline persistence or real-time collaborative editing. A
  device loads the current remote state when it starts or signs in.

## Deployment and operations

- Add Netlify configuration for the static publish directory and function
  directory; use Netlify's local development tooling so functions and Blobs
  can be exercised locally.
- Document creation of the GitHub OAuth application, the required callback
  URL, the Netlify environment variables, and how to set the allowed account's
  numeric GitHub ID.
- Document disabling Deploy Previews in the Netlify site settings. This is a
  dashboard action and cannot be enforced by repository code alone.
- Update the README to describe Netlify as the supported deployment target,
  the account restriction and storage behavior, required setup, migration,
  and continued backup responsibilities.
- Do not log OAuth codes, tokens, session cookies, or expense data.

## Testing

Use Node's built-in test runner and dependency-injected/mock GitHub and Blobs
clients. Tests must cover:

- OAuth state validation, successful and rejected GitHub identities, session
  validation, logout, and malformed or expired sessions.
- Unauthenticated API rejection, state validation, conditional initial
  migration, successful reads/writes, ETag conflicts, and storage failures.
- App startup distinguishing an empty store from failed reads; local migration
  only when the remote key is absent; local copy preservation; visible failed
  saves and retained backup export/import behavior.
- Existing calculator, loan, reports, backup, and server behavior that remains
  relevant to the supported app.

Tests must not require real GitHub credentials or a live Netlify site.

## Acceptance criteria

- A signed-in `A-TongMY` account can load and save the same expense data from
  multiple devices through Netlify.
- Any other GitHub account is rejected before it can read or write the data.
- Browser code contains no OAuth client secret, signing secret, or Blobs
  credential.
- Existing local data is offered for migration only when the remote store is
  confirmed empty, and its browser copy remains intact.
- Concurrent stale writes fail visibly without silently overwriting newer
  remote data.
- Network and storage errors never appear as successful saves or empty data.
- Netlify Deploy Previews are documented as disabled, and the app does not
  claim support for non-Netlify production hosting.
