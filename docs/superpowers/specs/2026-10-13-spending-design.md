# Daily Spending and Lifestyle Actuals

## Intent and scope

Replace manual monthly check-ins with daily Spending entries linked to Expenses
Lifestyle categories. Recorded monthly category totals become the actual Lifestyle
cost used by Expenses and Home, while unrecorded category/month pairs continue to
use estimates. Preserve income, commitments, scenarios, Lifestyle categories,
houses, authentication, remote persistence, and recovery behavior.

This is a new cross-page subsystem and backup-schema change. Implementation starts
only after the user approves this written specification and the subsequent
implementation plan.

## Approved decisions

- Keep normal backup import/export on Home only. Keep exports available in
  save-failure, conflict, and expired-session recovery.
- Remove the Expenses Check-ins section. Old check-in records do not need to be
  retained and must not become Spending entries or contribute to actuals.
- Allow past, current, and future Spending dates.
- Require a positive amount, a description, and an existing Lifestyle category.
- Rename categories by stable identity: existing entries show the new name.
- Block deleting categories referenced by Spending entries.
- Restrict entries to their category's active months and block category period
  edits that would invalidate existing entries.
- Use recorded actuals in remaining-income calculations and projections, including
  future months. Retain estimates for categories without entries.
- Include add/edit/delete, month/category filters, a newest-first list, filtered
  totals, and Spending metrics/chart on both Spending and Home.
- Metrics/chart on Spending follow both filters. Home shows all categories for the
  current month.
- Average per calendar day is the full filtered monthly total divided by all days
  in that month, including future-dated entries in the numerator.

## Navigation and page layout

Navigation includes Home, Expenses, Spending, and Houses. Existing routes retain
their behavior; Spending has its own route. The header remains usable on narrow
screens with all account and save-status controls accessible.

Move the existing shared Backup panel inside Home. It is not duplicated or
rendered on Expenses, Spending, Houses, or future pages. Its existing import/export
workflow remains functional. Recovery exports are separate from page placement.

Remove the Check-ins entry form and table from Expenses. Do not remove the
Lifestyle estimate editor or change commitments, houses, or scenario controls.

Spending contains:

1. Month and category filters, defaulting to the current month and all categories.
2. Metrics: recorded total in MYR, entry count, and average per calendar day.
3. A spending-by-category chart using existing chart components and live category
   names, with accessible labels and an explicit empty state.
4. A form for adding or editing an entry.
5. A newest-date-first transaction list showing date, category, description,
   amount, and edit/delete actions, plus the filtered total.

Home gains a Spending section with the same metrics and category chart for the
current month across all categories, and a link to Spending. The chart and summary
share one data calculation with the Spending page.

### UX and visual style

Keep the existing simple visual language: compact cards, clear spacing, short
labels, and no explanatory walls of text. Use existing sprite icons for actions
where their meaning is clear, especially edit, delete, add, and navigation.
Icon-only controls require accessible names and tooltips; field labels, totals,
validation errors, and destructive confirmations must remain understandable.
Preserve keyboard interaction, focus recovery after edits, readable empty states,
and responsive mobile layouts. The interface should communicate through its
structure and state rather than verbose instructions.

## Entry workflow and validation

Persist each entry as `{ id, date, categoryId, amount, description }`.

- `id` is a stable generated identity using the existing ID helper.
- `date` is a real local calendar date in `YYYY-MM-DD`, using the existing supported
  year range, including leap-year validation. Default new entries to today.
- `categoryId` references an existing Lifestyle item's stable ID, not its name.
- `amount` is finite, strictly positive, and no greater than the existing
  `MAX_AMOUNT`; use existing MYR input and rounding conventions.
- `description` is required, nonblank, trimmed on form submission, and no longer
  than 500 characters.
- The entry's calendar month must lie within the category's inclusive start/end
  months, if configured.
- Spending has at most 2,000 entries, matching the existing list limit.
- The existing 2 MiB backup limit still applies.

Adding and editing submit through the existing immutable state mutation and
serialized remote-save queue. Editing retains the entry ID; cancellation does
not mutate state. Invalid input and capacity errors are shown explicitly without
truncating or silently dropping entries.

Deletion requires confirmation and removes only the selected entry. Deleting the
last entry for a category/month restores estimate-based calculations for that
pair.

If no Lifestyle categories exist, show a link to Expenses to add one; do not allow
uncategorized Spending. Renaming a category immediately updates labels on all
linked entries, filters, reports, and charts.

Category deletion is blocked while any Spending entry references it, with a
message explaining that the entries must first be moved or deleted. Changing a
category's start/end months is blocked if any linked entry would fall outside
the proposed period. Users can first edit the entries' categories or dates, or
delete them.

## Filters and metrics

The selected month is required; there is no all-month aggregate mode in this
scope. The category filter offers all current categories plus All categories.

Both filters control the list, recorded total, entry count, average, and category
chart. The list sorts by date descending; same-date entries use deterministic
saved-list ordering. Editing an entry's date or category can move it outside the
selected filters; the saved entry must not be mistaken for a failed write.

The total is the sum of amounts for matching entries, rounded using the existing
currency helper. Category chart values are those same amounts grouped by
category. The average uses the full number of calendar days in the selected
month, not elapsed days or the number of dates with entries.

An empty filtered result shows zero total, zero entries, zero average, and an
explicit chart/list empty state. A current-month Home summary does not inherit
filters from Spending.

## Actuals and estimate calculations

Daily entries are the only stored source of actuals. Derive category/month totals
from them; do not persist a synchronized second set of monthly check-in records.

For each active Lifestyle category in a calculated month:

- With at least one Spending entry, use the sum of those entries as both the low
  and high monthly cost.
- With no entry, use the existing cadence-normalized low/high monthly estimates.

Actuals are amounts paid, so do not divide them by `everyMonths`. This rule applies
to past, current, and future months without waiting for future entry dates to
arrive.

Apply the same effective Lifestyle cost calculation to:

- Expenses current overview and remaining income.
- Projection rows, baseline/scenario figures, and tightest-month selection.
- Home expense metrics, monthly remaining charts, category cost breakdowns, and
  income allocation summaries.

Keep commitment calculations, scenario inclusion, active-period rules, and
projection horizon unchanged. Preserve estimate-editor details as estimates;
make effective actual/mixed totals clear rather than implying they are still
entirely estimates.

Replace check-in-based actual-versus-estimate reporting with derived monthly
category comparisons. Compare recorded category totals with the current category's
cadence-normalized estimate. Include only category/month pairs with entries in
actual-versus-estimate aggregates; unrecorded categories are not zero actuals.
Use current category names and estimates, so editing an estimate updates its
comparison. Preserve the existing under/within/over semantics and recent-month
reporting intent.

## Persistence, upgrades, and backups

Increment the backup schema from version 6 to version 7. The canonical state
contains income, commitments, Lifestyle, houses, and Spending; check-ins are no
longer part of the canonical state.

Keep importing supported older backup versions. Validate their original version's
data before upgrading, retain all unrelated fields using existing normalization,
initialize Spending to an empty list, and deliberately discard check-in records.
Show a clear upgrade notice that old check-ins are no longer used. Never invent
daily dates or descriptions from monthly totals.

Opening an older remote record must not perform an unconditional migration write.
Load and upgrade it in memory, retain its ETag, and persist the new format through
the normal conditional save mechanism. Browser legacy migration continues to be
opt-in, conditional on remote absence, and leaves the browser copy unchanged.

New exports use schema version 7. New imports and server writes validate entry
shape, unique IDs, date validity, positive amounts, description bounds, category
references, and active-month consistency. A malformed Spending list or invalid
reference is an error, not an empty-state fallback. Older deployed versions will
reject version 7 rather than silently strip Spending.

Retain stable-account authentication, strongly consistent remote reads,
create-only first writes, conditional ETag updates, serialized saves, explicit
conflicts, retry, and exports of unsaved in-memory state. No deployment settings,
credentials, Git identities, or GitHub-account selection change as part of this
feature. Do not push or deploy without explicit authorization.

## Implementation boundaries

- A focused Spending domain module handles validated transactions, aggregation,
  and category-integrity rules without DOM access.
- A Spending UI module handles its form, filters, and list using the existing
  `getState`/`commit` pattern.
- Existing calculation/report modules consume shared actual-aware monthly cost
  helpers rather than duplicate aggregation in each page.
- A shared summary renderer uses the same report data for Spending and Home.
- Backup and server validation reuse the same rules; add new browser modules to
  the existing asset allowlist.
- Keep unrelated functionality and styling intact; update directly related
  README descriptions and limits.

## Verification and acceptance

Implement test-first, with regression coverage for:

- Old version upgrades retaining unrelated data and discarding check-ins.
- Version 7 round-trips, invalid lists, category references, active months, real
  dates/leap days, description bounds, entry limits, and body-size limits.
- Authenticated remote load/save, conditional first writes, stale conflicts,
  migration, recovery exports, and queue semantics for the new state.
- Adding/editing/deleting entries and category deletion/period guards.
- Month/category filters, totals, counts, averages, and category chart data,
  including empty states, leap February, and future months.
- Actuals replacing estimates per category/month, mixed actual/estimate results,
  raw payment amounts for nonmonthly categories, and restoring estimates after
  the last entry is removed.
- Baseline/scenario calculations and Home figures matching Expenses, without
  changing projection horizons, commitments, or housing calculations.
- Home-only backup visibility, Spending navigation, save/recovery UX, and
  responsive layouts.

Run the relevant focused tests during each change and the full existing suite
and build before completion. Perform credential-free browser verification with
synthetic data, including CRUD, filters, category guards, recalculated Expenses
figures, Home summaries, and mobile layouts. No real expense data or secrets
belong in tests, logs, or committed artifacts.

Out of scope: refunds/negative entries, standalone spending categories, attachments,
recurring entries, bank integrations, multi-user sharing, all-month filtering,
and changes to hosting/authentication.
