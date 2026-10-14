# Renovation planning and payment tracking

Status: specification and implementation plan approved in chat, including the confirmed Asia/Kuala_Lumpur accounting time zone and inline execution in the existing checkout.

## Goal and scope

Add a **Renovation** menu for planning and tracking renovation costs against existing Houses. Each house has one renovation workspace and its own user-created renovation categories. Users retain an item's budget, enter its actual total cost when known, record deposits and other real payments, and optionally plan monthly installments.

Renovation has a top-of-page overview and category breakdowns. Home shows a separate renovation summary panel for each house with renovation items. Renovation costs remain separate from Expenses, Spending, monthly remaining income, and their projections.

Implementation stays inline in the current chat, without subagents. Preserve completed Spending work, the conditional-save transport fix, existing edits, and repository Git rules. Feature commits and publishing require separate user authorization.

## Approved accounting decisions

- One item holds an optional budget and optional actual total cost. It must have at least one of them.
- Budget is optional, including for items created directly with actual cost. Missing budget is **Not budgeted**, not zero.
- Recorded payments, not elapsed schedule dates, determine paid amounts.
- Each payment has a real date, positive amount, deposit/payment label, and optional link to one installment.
- Actual payment dates are today or earlier. Future payments belong in a schedule, not the actual-payment ledger.
- Actual total cost is required before recording payments or creating an installment plan.
- Each item supports one optional equal-monthly installment plan: start month, amount, and payment count.
- Partial payment plans are allowed; show the amount not yet scheduled.
- A payment may optionally link to an installment. Linked payments cannot exceed that installment's remaining amount.
- Excess intended for another installment or an unlinked payment must be entered separately; do not automatically redistribute it.
- Total recorded payments cannot exceed actual cost. Update actual cost before recording additional money.
- Unpaid scheduled amounts cannot exceed actual outstanding. An extra unlinked payment requires allocating it or adjusting the schedule first if it would violate that rule.
- An unpaid installment is overdue after its due month ends. An unpaid installment in the current month is **Due this month**.
- House and category deletion are blocked while referenced. Item deletion requires explicit confirmation that its payments and schedule will also be removed.

## Data model

Extend canonical state with dedicated renovation lists:

- `renovationCategories`: `{ id, houseId, name }`
- `renovationItems`: `{ id, houseId, categoryId, name, budget?, actualCost?, notes?, installmentPlan? }`
- `renovationPayments`: `{ id, itemId, date, amount, kind, installmentMonth? }`

`kind` is `deposit` or `payment`. `installmentPlan` is `{ startMonth, amount, count }`. An item's plan generates one installment per consecutive calendar month. Its installment identity is the pair `(itemId, month)`, not a mutable row number. A payment's optional `installmentMonth` must identify a generated installment for its item.

Categories belong to exactly one existing house. An item's category must belong to the same house as the item. Payments reference existing items. IDs remain stable through edits and renames.

House/category names are resolved from their current records, not copied into items. Category and house renames therefore propagate. Item editing uses categories from its own house; cross-house transfers are outside this scope.

Do not persist calculated totals, installment statuses, or budget gaps. Derive them from validated state using shared pure helpers.

## Validation and arithmetic

Reuse existing MYR conventions and limits:

- Maximum individual amount: RM 1,000,000,000.
- Amounts have at most two decimal places; calculate renovation balances in integer sen.
- Optional budget and actual total cost may be zero. Payment and installment amounts must be positive.
- Names are trimmed, nonblank, and at most 80 characters.
- Optional notes are at most 500 characters.
- Each renovation list has at most 2,000 records, with unique nonblank IDs.
- A plan has an integer count from 1 to 600.
- Dates/months use the app's real-date validation and 1900-9999 range. A schedule cannot run beyond the supported range.
- Renovation's accounting day and month use `Asia/Kuala_Lumpur` consistently in the browser and server, not UTC truncation or each device's local zone. Existing pages keep their current date behavior.
- Existing 2 MiB backup limits remain enforced; per-list limits do not guarantee a file fits.

Apply relation and financial validation to UI changes, imports, exports, and API writes. Missing or invalid canonical renovation lists fail explicitly rather than being replaced with empty lists.

If `paid > actualCost`, reject the change. If an installment's linked payments exceed its amount, reject it. If scheduled remaining exceeds actual outstanding, reject it. An item's actual cost or plan cannot be removed while payments or allocations would become invalid.

Display an actionable validation error and preserve the draft when a change is rejected. Do not silently clamp amounts, discard payments, or adjust installments.

## Calculations

For each item:

- **Budget**: its original entered budget, or Not budgeted.
- **Expected cost**: actual cost when present, otherwise budget. Check presence explicitly so actual zero does not fall back to budget.
- **Paid**: sum of all recorded payments, including deposits and linked payments.
- **Actual outstanding**: actual cost minus paid; not applicable to budget-only items.
- **Installment remaining**: installment amount minus payments explicitly linked to that month.
- **Scheduled remaining**: sum of all installment remaining amounts, including past and current unpaid installments.
- **Unscheduled actual balance**: actual outstanding minus scheduled remaining.
- **Due this month**: installment remaining for the current month.
- **Overdue**: sum of installment remaining for earlier months.

For house/category totals:

- **Budgeted total**: sum of entered budgets; label it as budgeted, not a complete budget when some items are unbudgeted.
- **Expected total**: sum of effective expected costs across all items.
- **Actual-cost total**: sum of entered actual costs; budget-only items do not contribute.
- **Paid**, **Actual outstanding**, **Scheduled remaining**, **Unscheduled actual balance**, **Due this month**, and **Overdue**: sum of the corresponding item amounts.
- **Not budgeted** count: items without budget.
- **Budget versus actual**: compare only items containing both budget and actual cost, using their actual sum minus their budget sum. Do not compare the actual-cost total with budgets for unrelated planned items.

Example: Cabinets budget RM 10,000, actual RM 12,000; Painting budget RM 3,000 with no actual. Budgeted total is RM 13,000; expected total is RM 15,000; actual-cost total is RM 12,000. If Cabinets has a recorded RM 2,000 deposit and ten RM 1,000 installments, paid is RM 2,000, actual outstanding RM 10,000, scheduled remaining RM 10,000, and unscheduled actual balance RM 0.

Passing a month never increases paid. Due and overdue amounts are portions of outstanding, not additional costs to add to it.

## Editing and deletion

- Add/edit/delete categories within the selected house. Block deletion of a referenced category with a clear explanation.
- Add/edit items, budget, actual cost, and notes. Category reassignment stays within the item's house.
- Add/edit/delete payments and their optional installment link. Recalculate and validate the entire affected item before applying a change.
- Schedule edits preserve months and amounts with linked payments. If an edit would remove or change such an installment, explain that its payments must be unlinked first.
- Unlinking a payment retains its date, amount, kind, and item reference; it never changes total paid.
- Where unlinking alone would temporarily over-schedule the outstanding balance, stage unlinking and the related schedule adjustment together in one item-level edit and validate/save them atomically. The same applies to an extra unlinked payment that needs a schedule reduction. Preserve the draft until the combined change is valid; never persist invalid intermediate steps.
- Removing a plan is allowed only after its payment links are removed and the resulting state is valid.
- Block deleting a house referenced by renovation categories or items. Empty, unreferenced houses keep existing deletion behavior.
- Confirm item deletion with explicit wording about removing associated payments and the plan. Cancellation changes nothing.

## Renovation page

- Add the `#/renovation` route and **Renovation** navigation label.
- Select an existing house. With no houses, show an explanatory link to Houses rather than allowing orphan records.
- At the top, show house-wide budgeted total, expected total, actual-cost total, paid, actual outstanding, due this month, overdue, and unscheduled actual balance.
- Show not-budgeted counts and the comparable budget-versus-actual gap with clear labels.
- Show a category breakdown of the same financial measures.
- Provide per-house category management and item creation.
- Expand an item to view/edit its details, installment plan, schedule statuses, and payment records.
- Indicate budget-only items without suggesting they are unpaid actual liabilities.
- Use existing controls, currency formatting, confirmation, draft-preservation, accessibility, and responsive patterns.

## Home

Show one Renovation summary panel for every house with renovation items, with the house's current name and a link to its workspace. Houses without items do not receive an empty renovation panel.

Use the same shared calculations as the Renovation overview, without depending on that page's selection or expanded item. Include budgeted total, expected total, actual cost, paid, actual outstanding, due this month, overdue, unscheduled actual balance, and unbudgeted-item context.

Month/day rollover in `Asia/Kuala_Lumpur` must refresh due/overdue figures on Renovation and Home. Nothing is automatically recorded as a payment.

## Persistence and backup compatibility

- Keep the current authenticated state endpoint and save queue.
- Preserve JSON write conditions, atomic Blobs conditions, ETag updates, conflict handling, and recovery exports.
- Introduce schema version 8 with renovation lists required in canonical state.
- Versions 1-7 initialize renovation lists empty only after validation under their original supported schema.
- Schema 7 retains all Spending entries unchanged.
- Freeze Spending introduction at version 7 and retired check-in behavior at its historical boundary; do not use the new current version as a proxy for feature introduction.
- Versions 1-6 retain the already-approved legacy upgrade behavior, including empty Spending and the retired check-in notice where applicable.
- GET upgrades older blobs in memory and preserves their ETag without a migration write.
- Bootstrap, state initialization/reset, export/import, API GET/PUT, recovery, and asset allowlisting all recognize the new state and modules.
- Invalid references, malformed lists, invalid money, invalid payment allocations, and newer-schema files fail visibly without clearing existing data.

## Architecture and verification

Use a dedicated pure renovation domain/calculation module, a page controller, and shared summary rendering as appropriate to the existing patterns. Both page and Home consume the same calculations. Keep payment accounting out of mortgage schedule helpers and Spending calculations.

Test first, inline, using synthetic data:

- Budget-only, actual-only, explicit zero, mixed expected totals, and comparable-only budget gaps.
- Integer-sen arithmetic, decimal boundaries, limits, and totals across multiple houses/categories.
- Deposits, partial plans, multiple payments per installment, unlinked payments, overdue/month rollover in `Asia/Kuala_Lumpur`, and no auto-payment.
- All financial guards, edits, unlinking, cancellations, deletion guards, and stable identity.
- House/category renames and cross-house reference rejection.
- Schema 1-6 compatibility, nonempty schema-7 Spending preservation, schema-8 round-trip, strict malformed-state rejection, and preserved ETags.
- End-to-end client/handler/SDK-boundary conditional saves with dropped standard headers, stale conflicts, and recovery paths.
- Browser validation of navigation, forms, summaries, Home independence, mobile layout, and reload persistence through a synthetic backend.
- Focused tests per checkpoint, then full suite, build, whitespace checks, and editor diagnostics before completion.

No production writes are needed for implementation verification. Existing unrelated files and global/system Git configuration remain untouched.
