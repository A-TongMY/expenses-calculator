# UI Simplification and Renovation Rework — Implementation Plan

> Execute inline with the executing-plans skill, test first (TDD). Show every read, edit and test step.

Spec: [2026-10-16-ui-simplification-design.md](../specs/2026-10-16-ui-simplification-design.md)

Goal: Simplify Renovation (no categories, simple Add item, inline deposits/payments/plan), use icon-only in-page actions app-wide, add "More options" and ⓘ popovers, and show clear Houses loan labels — without changing accounting results.

## Global constraints

- Work inline only. No subagents or background agents.
- Commit and push only when the user asks. Use only `A-TongMY` with command-scoped Git config (reread `AGENTS.md` first).
- Do not touch `.vscode/`.
- Never write to production. Read-only `GET /api/state` only.
- Keep existing limits, validation and accounting behavior unless the spec changes them.
- Each task ends green: `npm test`, plus the browser suite when UI changes.

## Review focus

1. Linked-deposit migration: schema-8 deposits with `installmentMonth` become `kind: "payment"`, so every valid schema-8 state stays valid under "deposits + plan ≤ actual cost".
2. Non-object entries inside schema-8 arrays must not crash the upgrade.
3. An invalid field hidden in a collapsed "More options" must open its `details` and be focusable.
4. Rerenders keep the inline editor draft and focus.
5. Add-payment and plan buttons are disabled when an item has no actual cost; removing actual cost is blocked while payments or a plan exist.

## Task 0 — Home grouped costs (already done, uncommitted)

Files: `home.js`, `styles.css`, `test/browser/ui-regressions.html`. Verified (42/42 browser, 387/387 node). Commit only when the user asks.

## Task 1 — Renovation model without categories (`renovation.js`)

Tests first: rewrite `test/renovation.test.js`.

- `allocateInstallments(plan, payments, month)`
  - Pools Payment-kind amounts; deposits never count.
  - Fills installments oldest first. Rows: `{month, amount, covered, remaining, dueStatus}` where `dueStatus` is `paid | due | overdue | upcoming`.
  - Cases: no payments; partial cover; overpay spills to next; deposit ignored; month before/at/after due.
- `stateError` rules
  - No `renovationCategories`, no `categoryId`, no `installmentMonth`.
  - deposits + plan total ≤ actual cost; paid ≤ actual cost; plan requires actual cost.
  - Messages prefixed with `"<item name>: "`.
- `renovationReport(state, houseId, month)`
  - Items: `{item, payments (date, then id), budget, actualCost, paid, outstanding, covered, due, overdue, installments}`.
  - Totals: `{budget, actualCost, paid, outstanding, due, overdue}`.
- Mutations (validate, return new state, never mutate input):
  - `saveRenovationItem(state, item, today)` keeps the existing plan; rejects removing actual cost while payments or a plan exist.
  - `setInstallmentPlan(state, itemId, plan | null, today)`.
  - `saveRenovationPayment(state, payment, today)`; changing `itemId` errors "cannot be moved to another item".
  - `deleteRenovationPayment(state, paymentId, today)`.
  - `deleteRenovationItem(state, itemId)` removes its payments.
  - `assertHouseDeletionAllowed` checks items only.
- Remove `saveRenovationCategory`, `deleteRenovationCategory`.

Run: `node --test test/renovation.test.js` → fails first, then passes.

## Task 2 — Backup schema 9 (`backup.js`)

Tests first: `test/renovation-backup.test.js` (rewrite), `test/backup.test.js` (8→9 at lines 43, 95), `test/state.test.js` (175, 238: 8→9; 181: drop `renovationCategories`; 242: delete), `test/state-transport.test.js` (152: drop `installmentMonth`; 197: delete), `test/helpers/renovation-fixture.js` (drop categories and `categoryId`).

- `SCHEMA_VERSION = 9`. Upgrade for `< 9`:
  - Drop `renovationCategories`; strip `categoryId` from items.
  - Deposits with `installmentMonth` → `kind: "payment"`; strip `installmentMonth` from all payments.
  - Skip non-object entries safely (validation reports them afterwards).
- Remove `categoryId` / `installmentMonth` from field lists and `renovationCategories` from `emptyRenovation` and `toCurrentState`.
- Update `bootstrap.js` line 9 and `app.js` line 95 references.
- Test: a schema-8 state with linked deposits, upgraded, passes `isValidRenovationState` and keeps the same paid/outstanding totals.

Run: `npm test`.

## Task 3 — Summary tiles (`renovation-summary.js`)

- Tiles: Budget, Actual cost, Paid, Outstanding. Add Due and Overdue only when above zero. Remove the two notes that relied on removed totals.
- Used by the Renovation page and Home per-house panels.
- Browser test: tiles match totals; Due/Overdue hidden at zero.

## Task 4 — Renovation screen

- `index.html`
  - Sprite icons: `i-save`, `i-tools`, `i-card`, `i-calendar`, `i-info`.
  - Nav Renovation link and Home Renovation heading use `#i-tools`.
  - Replace Renovation markup: house select, summary, `details.add#renovation-add` containing `#renovation-item-form` (name, notes, budget, actualCost, `p[data-role="message"]`, primary icon submit, hidden cancel), and `ul#renovation-items`.
- New `renovation-ui.js` → `setupRenovation({getState, commit, newId})` returning `{render, reset, selectHouse}` (same API used by `app.js`).
  - One active inline editor `{itemId, paymentId, form, baseline}`; switching with unsaved changes asks for discard.
  - Every action saves immediately through the Task 1 mutations; errors show in the form message and nothing saves.
  - Cards `li.renovation-item[data-id]` with icon buttons (`data-action` edit, add-payment, plan, delete), created once and refreshed each render.
  - Labels: "Edit X", "Add payment to X", "Monthly plan for X", "Delete X", "Remove plan".
  - add-payment and plan disabled with title "Set actual cost first" when there is no actual cost.
  - Payment rows via `syncRows`, keeping the row being edited.
- `styles.css`: remove old Renovation rules (around lines 225, 342–351); add card, payment row and installment row styles.
- Delete `test/renovation-ui.test.js`.
- Browser tests (rewrite lines 268–460, real-app test 603–607, layout 745–752, `expensesFrame` → `schemaVersion: 9`):
  add item; edit inline; add deposit; add payment fills oldest installment; set and remove plan; disabled buttons; error keeps the draft; focus stays on the acted row. Use `renovationMonth()` as plan `startMonth` where Due is asserted.
- README: Renovation section (17–33), UI tests note (49), schema note (90).

## Task 5 — Icon buttons app-wide

- `ui.js`: `setIconButton(button, name, label)` sets the icon, `aria-label` and `title`, and clears text.
- Use it for in-page actions in Expenses, Spending, Houses and Renovation, including edit-clone submit at `app.js:254`, `houses.js:109`, `spending-ui.js:68` (`"save", "Save"`).
- Account, sign-in, Export/Import and recovery buttons keep their text.
- `styles.css`: `.icon-btn.primary`, `.icon-btn:disabled`.
- Browser test: every in-page action button has an accessible name and no visible text.

## Task 6 — More options, invalid reveal, ⓘ popovers, one "+ Add" pattern

- `details.more` "More options" in Expenses forms (From, Until, Scenario) and the Houses form (Bank installment).
- `ui.js` `revealInvalid(form)`: capture-phase `invalid` listener that opens the enclosing `details`.
- ⓘ: `details.info` with a `summary` icon (tap-friendly) for long notes.
- Collapsible "+ Add" `details.add` for Expenses, Houses and Renovation; Spending keeps its always-open form.
- Browser tests: invalid field in closed More options opens it; ⓘ opens on click; layout checks pass.

## Task 7 — Houses loan labels

Tests first in `test/loan.test.js`:

- `loanTermLabels(house, summary)` returns `{term, payoff, paid}`.
- RM548,499 over 35 years with RM2,406 installment → `term: "420 months"`, `payoff: "416 payments · 4 months earlier"`, `paid: "~46 paid (estimated)"` (paid count per the fixture month).
- 0% loan of 120,000 over 120 months with 900 installment → `payoff: "134 payments · 14 months later"`.
- Standard installment → `payoff: null`.

Use it in the `houses.js` card in place of the "Payments" stat (around line 207).

## Task 8 — Full verification

- `npm test`
- `npm run test:ui`, then Playwright: wait for `window.uiTestResults`; run `window.runLayoutChecks({textSize})` at widths 320/360/390/436/768/1024/1440 and text sizes 16 and 24.
- `npm run build`
- `git diff --check`
- Stop the UI server. Report results; commit and push only when asked.

## Deploy caveat

A tab still running the schema-8 client refuses schema-9 state as a "newer version" until reloaded. Reload all open tabs after deploy.
