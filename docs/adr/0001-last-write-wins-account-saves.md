---
status: accepted
---

# Last-write-wins account saves

Use unconditional whole-account writes for ordinary auto-saves and explicit imports, rather than requiring the previously loaded storage version. The user prefers simpler personal-app saving and explicitly accepts that a stale snapshot may silently replace newer saved data; conditional writes are a Netlify Blobs capability, not a requirement.

## Agreed behavior

- Keep the single-tab queue: serialize writes and coalesce pending edits into the newest snapshot.
- Import intentionally replaces the entire account snapshot after confirmation. It waits behind an in-flight save; later manual edits follow it in order.
- On a genuine save failure, retain the newest unsaved snapshot and show the error. Explicit Retry or the next edit/import attempts the newest snapshot again rather than remaining permanently paused.
- Do not add an application-level automatic retry loop. Existing transport retries must be evaluated separately; a request can commit even when its acknowledgement fails.
- Keep authentication, origin checks, data validation, backup schema upgrades, and recovery export. Never report a save as successful without a successful acknowledgement.

## Migration boundary

Keep the one-time, opt-in legacy browser migration create-only. It is an initialization path, not explicit Import, and must not replace an account that became populated before migration completed.

## Consequences

Last-write-wins means storage write order, not the most recent human intent. Different tabs/devices, delayed requests, and retries can overwrite newer data without a conflict warning. The single-tab queue limits ordinary request overlap but does not provide cross-client coordination or eliminate ambiguous network outcomes.

Storage versions are separate from backup schema versions. Retain schema versions to support older exports; do not require a storage version to load data or save ordinary edits or imports. Keep JSON/HTTP version metadata and explicit conditional-request support on the server for already-open older clients; the current browser no longer consumes those tokens. Refresh old tabs after deployment, and deploy the browser and Function together.

Conditional saves with idempotent retry recognition and explicit conflict recovery were considered. They offer stronger overwrite protection but were not selected because the user prefers simpler saving and accepts the data-loss trade-off.

## Evidence

[Netlify Blobs documentation](https://docs.netlify.com/build/data-and-storage/netlify-blobs/) describes last-write-wins behavior. Local synthetic tests reproduced response-token transport failures and a committed write reported as a conflict after an SDK retry; neither is confirmed as the cause of the reported production incident.

The user confirmed this complete design, including the migration boundary, for inline implementation. This decision record does not establish that a production incident has been resolved or authorize publishing.
