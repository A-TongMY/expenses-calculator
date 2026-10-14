# Renovation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. User-selected execution: inline in this chat, no subagents or background agents.

**Goal:** Plan renovation budgets and actual costs per house, record deposits/payments, track monthly installment plans, and show consistent Renovation/Home overviews.

**Architecture:** Add dedicated renovation state lists and pure domain/calculation helpers. A page controller stages item, payment, and schedule edits as one validated change; a shared summary renderer serves Renovation and Home. Reuse the existing authenticated conditional-save queue and upgrade backups without losing Spending.

**Tech Stack:** Browser JavaScript ES modules, Node built-in tests, HTML/CSS, existing Netlify Functions and `@netlify/blobs`; Node.js `>=20.12.2`. No new dependency is required.

**Spec:** [Approved Renovation design](../specs/2026-10-14-renovation-design.md)

## Global Constraints

- Keep all execution inline, with visible read/edit/test checkpoints and exact failure reporting; do not launch subagents.
- Read root `AGENTS.md` before every commit. Publishing requires separate user authorization. Use `A-TongMY` / `45504842`; global and system Git configuration remain untouched.
- Preserve unrelated `.vscode` files, existing Spending behavior, conditional-save transport, ETags, conflicts, and recovery.
- Renovation does not affect Expenses, Spending, remaining income, or their projections.
- One workspace per house; user-created categories are house-specific.
- Maximum individual amount: RM 1,000,000,000. Renovation money has at most two decimals; arithmetic uses integer sen.
- Optional budget and actual cost may be zero. Payments and installment amounts are strictly positive.
- Names: trimmed/nonblank, maximum 80 characters. Notes: maximum 500 characters.
- Each renovation list: maximum 2,000 records with unique nonblank IDs.
- Installment count: integer 1-600. Dates/months: real values within 1900-9999.
- Renovation's accounting day and month use `Asia/Kuala_Lumpur` consistently in browser and server. Existing pages keep their current date behavior.
- Backup limit remains 2 MiB. New canonical schema is 8; versions 1-7 upgrade without clearing nonempty schema-7 Spending.
- Actual cost is required for payments/plans; no overpayment or automatic redistribution.
- Outstanding is actual cost minus recorded payments. Scheduled remaining cannot exceed outstanding.
- Missing budget is Not budgeted. Only items with both budget and actual cost participate in their comparison.

## Review Focus

1. Midnight in Malaysia while the server is on the previous UTC date: valid payments and due/overdue figures must agree (Task 1).
2. Schema-version bump accidentally classifying schema-7 Spending as legacy: entries and ETags must survive unchanged (Task 3).
3. Fully scheduled item with a paid installment: unlinking and schedule changes must save atomically rather than trapping the user in an invalid intermediate state (Tasks 2 and 4).
4. Background render/save while an item editor is open: payment/schedule drafts must survive without being committed or discarded (Tasks 4 and 5).
5. Account with multiple houses and identical category names: summaries, payment links, deep links, and deletion guards must stay house-specific (Tasks 1, 2, and 5).

## File map

- `renovation-calendar.js`: fixed-zone accounting day/month, injectable clock.
- `renovation.js`: money conversion, validation, references, reports, atomic item/category operations, house deletion guard.
- `renovation-summary.js`: render an accessible overview from a report; no accounting logic.
- `renovation-ui.js`: house/category selection and item-level draft workflow.
- `test/helpers/renovation-fixture.js`: synthetic valid houses and canonical renovation fixture.
- `test/renovation-calendar.test.js`, `test/renovation.test.js`, `test/renovation-ui.test.js`: targeted regressions.
- `backup.js`, `bootstrap.js`, `app.js`: schema, initialization, rendering, routing, import/reset integration.
- `houses.js`: referenced-house deletion guard.
- `home.js`, `index.html`, `styles.css`: separate per-house summaries and page markup.
- `public-files.js`: allowlist new browser modules.
- Existing backup/bootstrap/storage/state/transport/build tests: update canonical fixtures and preserve legacy fixture versions.
- `README.md`: renovation behavior, accounting definitions, and schema-8 backup documentation.

## Shared contracts

Canonical state adds:

```js
renovationCategories: [{ id, houseId, name }]
renovationItems: [{
  id, houseId, categoryId, name,
  // Optional fields are omitted, not null or empty numeric strings.
  budget, actualCost, notes,
  installmentPlan: { startMonth, amount, count },
}]
renovationPayments: [{
  id, itemId, date, amount,
  kind: "deposit", // or "payment"
  installmentMonth, // optional; identifies one generated month for itemId
}]
```

`renovationDate(now = new Date())` returns `YYYY-MM-DD` in `Asia/Kuala_Lumpur`; `renovationMonth(now = new Date())` returns that date's first seven characters.

`toRenovationSen(amount)` returns a safe integer or throws `RangeError`. Do not change existing `isMoney` rules for other features.

`isValidRenovationState(state, today = renovationDate())` returns a boolean for backup validation. Mutation helpers throw actionable errors on invalid input instead of returning success-shaped defaults.

`renovationReport(state, houseId, month = renovationMonth())` returns:

```js
{
  houseId,
  totals: {
    budgeted, expected, actualCost, paid, outstanding,
    scheduledRemaining, unscheduled, due, overdue,
    unbudgetedCount, comparedBudget, comparedActual, gap,
  },
  categories: [{ categoryId, name, totals }],
  items: [{
    item, budget, actualCost, expected, paid, outstanding,
    scheduledRemaining, unscheduled, due, overdue,
    installments: [{
      month, amount, paid, remaining,
      paymentStatus, // "unpaid" | "partial" | "paid"
      dueStatus, // "past" | "current" | "future"
    }],
  }],
}
```

Report monetary values are MYR numbers converted from integer-sen results. Budget/actual cost are `null` when absent in item reports; outstanding/unscheduled are `null` for budget-only items. House/category aggregates exclude those null liabilities. `gap` is `null` when there are no comparable items; otherwise it is `comparedActual - comparedBudget`.

All state mutation functions are pure:

- `saveRenovationCategory(state, category, today = renovationDate()) -> nextState`
- `deleteRenovationCategory(state, categoryId, today = renovationDate()) -> nextState`
- `saveRenovationItem(state, item, itemPayments, today = renovationDate()) -> nextState`
- `deleteRenovationItem(state, itemId, today = renovationDate()) -> nextState`
- `assertHouseDeletionAllowed(state, houseId) -> void`, throws if referenced.

`saveRenovationItem` replaces the item and its full associated payment list together, retaining unrelated items/payments. It checks linked months/amounts against the original plan: a changed/removed allocated installment must have its payments unlinked in the submitted draft.

`setupRenovation({ getState, commit, newId }) -> { render, reset, selectHouse }`.

`renderRenovationSummary(container, report) -> void` uses safe DOM construction and existing currency formatting.

---

### Task 1: Pure accounting, validation, and reports

**Files:** Create `renovation-calendar.js`, `renovation.js`, `test/helpers/renovation-fixture.js`, `test/renovation-calendar.test.js`, `test/renovation.test.js`. Read existing `rules.js`, `format.js`, and `calc.js`; reuse real-date/month constraints without introducing circular imports.

**Consumes:** Existing house identity, validation constants, and real date/month validators.

**Produces:** Calendar, money conversion, state validator, and report contracts above.

- [x] **Step 1: Add literal fixtures and failing tests.** Start with this fixture and add schema-independent canonical lists:

```js
export const fixture = () => ({
  income: 0, commitments: [], lifestyle: [], houses: [{
    id: "h1", name: "House One", loan: 100000,
    ratePercent: 0, termMonths: 120, startMonth: "2026-01",
  }], spending: [],
  renovationCategories: [{ id: "kitchen", houseId: "h1", name: "Kitchen" }],
  renovationItems: [{
    id: "cabinets", houseId: "h1", categoryId: "kitchen", name: "Cabinets",
    budget: 10000, actualCost: 12000,
    installmentPlan: { startMonth: "2026-10", amount: 1000, count: 10 },
  }],
  renovationPayments: [{
    id: "deposit", itemId: "cabinets", date: "2026-10-01",
    amount: 2000, kind: "deposit",
  }],
});
```

```js
test("Malaysia midnight does not use the previous UTC day", () => {
  const instant = new Date("2026-10-31T16:01:00Z");
  assert.equal(renovationDate(instant), "2026-11-01");
  assert.equal(renovationMonth(instant), "2026-11");
});
test("deposits reduce outstanding, not the actual total", () => {
  const report = renovationReport(fixture(), "h1", "2026-10");
  assert.equal(report.totals.actualCost, 12000);
  assert.equal(report.totals.paid, 2000);
  assert.equal(report.totals.outstanding, 10000);
  assert.equal(report.totals.scheduledRemaining, 10000);
  assert.equal(report.totals.unscheduled, 0);
  assert.equal(report.totals.due, 1000);
  assert.equal(report.totals.overdue, 0);
});
test("money uses exact sen without accepting extra decimal places", () => {
  assert.equal(toRenovationSen(0.29), 29);
  assert.equal(toRenovationSen(1000000000), 100000000000);
  assert.throws(() => toRenovationSen(1.001), RangeError);
  assert.throws(() => toRenovationSen(Infinity), RangeError);
});
```

- [x] **Step 2: Run red.** `node --test test\renovation-calendar.test.js test\renovation.test.js`. Confirm failures are missing behavior/exports, not fixture syntax.
- [x] **Step 3: Implement the calendar and money helpers.**

```js
const accountingDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit",
});
export function renovationDate(now = new Date()) {
  const parts = Object.fromEntries(accountingDate.formatToParts(now)
    .filter(({ type }) => ["year", "month", "day"].includes(type))
    .map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export const renovationMonth = (now = new Date()) => renovationDate(now).slice(0, 7);
```

For sen conversion, validate finite/range first; compute `sen = Math.round(amount * 100)` and require `sen / 100 === amount`. Return a safe integer. Do not reject ordinary representable values such as `0.29` solely because `amount * 100` has a floating-point residue.

- [x] **Step 4: Implement relational validation and derived schedules.** Validate all three lists, IDs, names, notes, optional field presence, money, payment kind/date, existing house/category/item references, same-house categories, count/month bounds, allocation caps, and aggregate invariants. Generate months using year/month integer arithmetic; refuse a final month beyond `9999-12`. Use maps for relation lookup and sums; do not scan every payment for every installment.
- [x] **Step 5: Add report and boundary regressions.** Include: actual `0` with budget `100` yields expected `0`; optional budget omitted yields unbudgeted count `1`; budget-only item yields no actual liability; mixed expected `15000` example; multiple linked payments totaling `1000`; partial payment `400` yields remaining `600`; month change creates overdue without increasing paid; two houses with identically named categories do not mix. Test zero/negative payments, `2001` records, `601` installments, invalid leap days, future payment relative to supplied today, cross-house references, plan-end overflow, malformed lists, and aggregate overpayment.
- [x] **Step 6: Run green.** Run the focused command again, then `node --check renovation.js` and `node --check renovation-calendar.js`. Review against every calculation in the spec. Stop at a visible checkpoint; commit only if authorized.

### Task 2: Atomic edits and deletion safeguards

**Files:** Modify `renovation.js`, extend `test/renovation.test.js`.

**Consumes:** Validated state and money/report/calendar helpers from Task 1.

**Produces:** Pure mutation functions and house guard contracts above.

- [x] **Step 1: Write failing atomic-edit tests.**

```js
test("unlinking a paid installment and reducing the schedule saves as one change", () => {
  const state = fixture();
  state.renovationPayments.push({
    id: "oct", itemId: "cabinets", date: "2026-10-14",
    amount: 1000, kind: "payment", installmentMonth: "2026-10",
  });
  const item = {
    ...state.renovationItems[0],
    installmentPlan: { startMonth: "2026-11", amount: 1000, count: 9 },
  };
  const payments = state.renovationPayments.map(({ installmentMonth, ...payment }) => payment);
  const next = saveRenovationItem(state, item, payments, "2026-10-14");
  assert.equal(next.renovationPayments[1].amount, 1000);
  assert.equal(renovationReport(next, "h1", "2026-10").totals.paid, 3000);
  assert.equal(renovationReport(next, "h1", "2026-10").totals.outstanding, 9000);
  assert.equal(state.renovationPayments[1].installmentMonth, "2026-10");
});
test("a referenced house cannot be deleted", () => {
  assert.throws(() => assertHouseDeletionAllowed(fixture(), "h1"), /renovation/i);
});
```

- [x] **Step 2: Run red.** `node --test test\renovation.test.js`.
- [x] **Step 3: Implement item-level replacement and final-state validation.**

```js
const next = {
  ...state,
  renovationItems: state.renovationItems.some(({ id }) => id === item.id)
    ? state.renovationItems.map((existing) => existing.id === item.id ? item : existing)
    : [...state.renovationItems, item],
  renovationPayments: [
    ...state.renovationPayments.filter(({ itemId }) => itemId !== item.id),
    ...itemPayments,
  ],
};
```

Before returning, enforce every draft payment's `itemId`, ID uniqueness, approved plan-edit allocation rules, and complete financial/reference validation. Clone incoming item/payment values so caller draft edits cannot mutate committed state. Throw a specific user-facing error describing the failed rule.

- [x] **Step 4: Implement category operations and deletion.** Referenced categories cannot be deleted. Category ownership cannot change to another house. Item deletion removes only that item's payments and embedded plan. The house guard blocks references from either categories or items. Unreferenced house behavior stays unchanged.
- [x] **Step 5: Extend edit regressions.** Reject reducing actual below paid, over-allocation, adding an unlinked payment while overscheduled, removing actual cost with a plan/payment, removing a linked installment, and category/house changes that orphan records. Accept extra payment plus schedule reduction in one change. Test category rename resolution, payment edits/deletions, original-state immutability, deleting one item without removing another's payments, and removing a plan with staged unlinks.
- [x] **Step 6: Run green and review.** `node --test test\renovation.test.js test\renovation-calendar.test.js`. Verify no helper commits invalid intermediate states or discards unrelated records. Commit only if authorized.

### Task 3: Schema 8, canonical state, and remote transport

**Files:** Modify `backup.js`, `bootstrap.js`, `app.js` initial state, `public-files.js`; update `test/backup.test.js`, `test/bootstrap.test.js`, `test/storage.test.js`, `test/state.test.js`, `test/state-transport.test.js`, and directly affected canonical fixtures found by targeted search.

**Consumes:** Renovation validator and canonical list contracts.

**Produces:** Strict schema-8 export/import/remote save, legacy upgrades, and blank state containing the three new lists.

- [x] **Step 1: Add a nonempty schema-7 regression before changing the current version.**

```js
test("schema 7 upgrades without clearing Spending", () => {
  const spending = [{
    id: "s1", date: "2026-10-13", categoryId: "food",
    amount: 12.5, description: "Lunch",
  }];
  const file = JSON.stringify({
    schemaVersion: 7,
    data: {
      income: 5000, commitments: [], houses: [],
      lifestyle: [{ id: "food", name: "Food", low: 400, high: 600, everyMonths: 1 }],
      spending,
    },
  });
  const { state } = readBackup(file);
  assert.deepEqual(state.spending, spending);
  assert.deepEqual(state.renovationCategories, []);
  assert.deepEqual(state.renovationItems, []);
  assert.deepEqual(state.renovationPayments, []);
});
```

- [x] **Step 2: Run red.** `node --test test\backup.test.js test\bootstrap.test.js`.
- [x] **Step 3: Implement fixed version boundaries.**

```js
const SCHEMA_VERSION = 8;
const SPENDING_SINCE = 7;
const RENOVATION_SINCE = 8;
```

Validate versions 1-6 through their existing legacy rules and discard retired check-ins as already approved; validate version 7 with the old Spending schema; validate version 8 with both Spending and renovation rules. Normalize only fields that did not exist in the source version. Export allowlisted category/item/payment/plan fields and preserve optional zero amounts. GET upgrades in memory and retains the stored ETag.

- [x] **Step 4: Update blank canonical state and existing tests surgically.** Add the new empty lists to `bootstrap.js` and `app.js`. Update current-schema fixtures/expected keys, not deliberately legacy fixture versions. Do not change JSON write-condition or auth/origin handling. Add the calendar/domain browser modules to `public-files.js`.
- [x] **Step 5: Add strict persistence regressions.** Round-trip a fixture with linked installments/payments; reject absent/null/malformed lists, orphan references, invalid decimals/allocations, and schema 9. GET a schema-7 remote blob with Spending and verify zero writes and identical ETag before a conditional save. Extend the real-SDK synthetic transport test with nonempty renovation data, verify reload equality, dropped conditional headers, and stale-write rejection.
- [x] **Step 6: Run green.** `node --test test\backup.test.js test\bootstrap.test.js test\storage.test.js test\state.test.js test\state-transport.test.js test\build.test.js`. Follow unexpected fixture failures rather than weakening assertions. Review the migrated output keys explicitly. Commit only if authorized.

### Task 4: Renovation page and atomic draft editor

**Files:** Create `renovation-ui.js`, `renovation-summary.js`, `test/renovation-ui.test.js`; modify `index.html`, `styles.css`, `public-files.js`, and `app.js` for controller/routing integration.

**Consumes:** Pure mutation/report contracts and canonical state.

**Produces:** `setupRenovation` and `renderRenovationSummary` contracts; usable page with house-specific category management and item/payment/plan CRUD.

- [x] **Step 1: Add a dependency-free draft-controller test seam.** Put draft state transitions in an exported `createRenovationEditor({ getState, commit, newId })` in `renovation-ui.js`; it must not access DOM until `setupRenovation` is called. Public editor methods: `start(itemId)`, `startNew(houseId, categoryId)`, `setItem(item)`, `setPayments(payments)`, `save(today)`, `cancel()`, `snapshot()`, `isDirty()`. `snapshot()` returns defensive copies; `start` clones the selected item/payment list. `startNew` creates `{ id: newId(), houseId, categoryId, name: "" }` with no payments and no monetary defaults. `isDirty` compares the draft with its initial snapshot. `save` uses `saveRenovationItem` and resets only after a successful commit. Add failing tests:

Review additions: `setPaymentDirty(boolean)` includes unstaged payment input in the discard guard and blocks item saving until that input is staged or cancelled. `categories()` returns current house-scoped `{ id, name }` choices; render refreshes only that select while preserving other draft fields. These cover the reproduced payment-loss and stale-category-label bugs.

```js
test("invalid staged edits preserve the draft without committing", () => {
  let state = fixture();
  let commits = 0;
  const editor = createRenovationEditor({
    getState: () => state,
    commit: (next) => { state = next; commits += 1; },
    newId: () => "new-id",
  });
  editor.start("cabinets");
  editor.setItem({ ...editor.snapshot().item, actualCost: 1000 });
  assert.throws(() => editor.save("2026-10-14"), /paid|cost|outstanding/i);
  assert.equal(commits, 0);
  assert.equal(editor.snapshot().item.actualCost, 1000);
  assert.equal(state.renovationItems[0].actualCost, 12000);
});
```

- [x] **Step 2: Run red.** `node --test test\renovation-ui.test.js`.
- [x] **Step 3: Implement the draft workflow and HTML.** One item-level Save applies staged item fields, payment rows, and plan together. Payment add/edit/remove and installment unlink actions update the draft and its preview, not saved state. A Cancel action restores committed values. Explain unsaved staged changes in the editor. Use existing safe `el`/icon helpers and explicit accessible field labels.

```js
try {
  editor.save(renovationDate());
  message.textContent = "";
  render();
} catch (error) {
  message.textContent = error.message;
  // Keep editor and fields intact; no reset on rejected save.
}
```

Apply maximums/steps to fields; distinguish blank optional money from explicit zero. Limit actual dates to `renovationDate()`. Label monthly rows with due/payment status separately. Confirm destructive item deletion including its payments/plan. Report category-reference errors in the category form.

- [x] **Step 4: Wire routing/render/reset hooks.** Add `renovation` to `PAGES`, initialize after the other controllers, call `render` from `renderAll`, refresh on route entry, and reset after successful state replacement/import. Add navigation and page markup, house selector, overview container, category manager, item editor/list, no-house and no-category guidance. Extend responsive rules without changing existing pages. Add UI/summary modules to the asset allowlist.
- [x] **Step 5: Test draft/cancel behavior and stale records.** An external state render must not replace active fields. If edited item/house is removed by a state replacement, explicit reset clears its draft. Failed commits preserve the draft. Cancel changes no canonical data. A combined unlink/schedule adjustment commits once. Opening a second house/item while dirty requires confirmation; decline preserves the draft. Tests cover these state transitions; browser checks cover actual controls.
- [x] **Step 5a: Test new-item creation through the same editor.** `startNew("h1", "kitchen")` must not commit. Set the draft to `{ ...editor.snapshot().item, name: "Painting", budget: 3000 }`; `isDirty()` becomes true. Saving creates one budget-only item without payments or a plan, with original records unchanged. Canceling an unfinished new item creates nothing.
- [x] **Step 6: Run green and build.** `node --test test\renovation-ui.test.js test\renovation.test.js test\build.test.js`, then `npm run build`. Review all DOM IDs/selectors, safe text rendering, and event handlers against the page. Commit only if authorized.

### Task 5: Home panels, house guards, and accounting rollover

**Files:** Modify `home.js`, `houses.js`, `app.js`, `index.html`; extend `test/renovation.test.js`, `test/renovation-ui.test.js`, and build tests as needed.

**Consumes:** Shared reports/summary renderer, controller `selectHouse`, and house-deletion guard.

**Produces:** Separate per-house Home renovation panels, house-aware navigation, safe house deletion, fixed-zone refresh.

- [x] **Step 1: Add regressions for home selection and two-house isolation.** Test reports for houses sharing category names, category/house renames, referenced empty-category house deletion, and overview values unaffected by controller selection or active drafts. Add a clock-injected rollover test at `2026-10-31T16:00:00Z` proving October unpaid installments become overdue and paid is unchanged.
- [x] **Step 2: Run red.** `node --test test\renovation.test.js test\renovation-ui.test.js test\renovation-calendar.test.js`.
- [x] **Step 3: Render per-house Home panels with current names.**

```js
const activeHouses = state.houses.filter((house) =>
  state.renovationItems.some(({ houseId }) => houseId === house.id));
for (const house of activeHouses) {
  const report = renovationReport(state, house.id, renovationMonth());
  // Build a details panel using el, then call renderRenovationSummary.
  // The link targets #/renovation?house=<encoded stable house ID>.
}
```

Use `URLSearchParams` to parse the hash query, validate the requested house exists, and route using only the path segment. Unknown/deleted IDs show guidance or the first available house, without mutating state. Preserve the existing active nav behavior and Home panel patterns.

- [x] **Step 4: Guard house deletion before confirmation/commit.** Call `assertHouseDeletionAllowed` and display its error through the repository's existing notice pattern. No linked data is silently cascaded. Preserve unreferenced house removal behavior.
- [x] **Step 5: Refresh accounting day/month independently.** Keep existing pages' local-month refresh. Add separate cached renovation accounting date/month; on focus/visibility and the existing refresh interval, refresh Renovation/Home when either changes. Refresh date maximums without resetting editor values; stale future-date drafts get a validation message rather than silent changes.
- [x] **Step 6: Run green and review.** Run the focused command from Step 2 and build tests. Inspect mobile Home with multiple renovation panels. Confirm Expenses and mortgage calculations are unchanged. Commit only if authorized.

### Task 6: Documentation and end-to-end verification

**Files:** Modify `README.md` and directly related tests if review finds a missing requirement. Keep execution logs outside tracked source; do not add ad hoc planning files.

**Consumes:** Complete feature and approved spec.

**Produces:** Verified, documented local feature ready for the user's integration decision.

- [x] **Step 1: Document user-visible accounting.** Explain optional budgets, expected versus actual costs, paid/deposit ledger, Malaysia accounting date, partial plans, overdue rules, combined draft saves, category/house deletion guards, separate Expenses behavior, and schema-8 preservation of old data. Update existing schema-7 documentation rather than leaving contradictory “new backups” statements.
- [x] **Step 2: Run the full native suite.** `npm test`. Record exact totals and every failure. Run `npm run build`, `git diff --check`, and editor diagnostics. Restore/install dependencies only after an actual missing-dependency failure.
- [x] **Step 3: Browser verification with synthetic storage only.** Prefer an existing working local task/server; inspect ports before starting anything. If using a task-owned server, verify responsiveness and stop that specific process afterwards. Do not write to production or real Blobs.
- [x] **Step 4: Verify the user journey.** Create two houses with separate Kitchen categories; add Cabinets budget `10000`, actual `12000`, deposit `2000`, ten installments of `1000`; add Painting budget `3000`. Confirm expected `15000`, paid `2000`, actual outstanding `10000`, unscheduled `0`. Add a linked October payment of `400`: paid `2400`, outstanding `9600`, October due `600`. Confirm Home per-house panels, no cross-house mixing, and unchanged Expenses. Save/reload through a synthetic client/handler boundary, not just an API response stub.
- [x] **Step 5: Verify edits and failure UX.** Edit/unlink with a simultaneous plan adjustment, cancel, reject overpayment and future date, rename categories/house, block referenced deletion, confirm item deletion cascade, preserve a dirty editor through render/save callbacks, simulate save conflict/offline/session expiry, and export recovery data. Import nonempty schema-7 Spending and older backups; verify schema-8 export/import. Test keyboard use and 375px mobile layout.
- [x] **Step 6: Inline final review against the spec.** Map every approved accounting, UI, validation, migration, and deletion requirement to test/browser evidence. Fix only related issues, repeat affected verification, then rerun full suite/build for the final tree.
- [x] **Step 7: Report completion without automatic publishing.** Give exact verification results, change scope, and any limitations. Ask the user before committing/pushing if they have not authorized it. Reread `AGENTS.md` and verify identities before every authorized commit; verify remote/local equality after an authorized push.
