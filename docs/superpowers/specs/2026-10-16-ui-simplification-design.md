# UI simplification and Renovation rework — design

Date: 2026-10-16. Supersedes the category, staging and installment-linking parts of
[2026-10-14-renovation-design.md](./2026-10-14-renovation-design.md).

## Goal

The app should feel simple to use. Renovation in particular is too complex: it requires
categories, a large Add form with plan and payment sections, and a staged "Save all changes"
flow. Every page also uses wordy buttons where an icon would do.

Success means:

- A Renovation item can be added with only name, notes, budget and actual cost.
- Payments and installment plans are added later from icon buttons on the item.
- Every in-page action is an icon button with an accessible label and tooltip.
- No existing data is lost, and accounting outside Renovation is unchanged.

## Decisions made with the user

| Question | Decision |
|---|---|
| Existing categories | Drop them. Items keep their names exactly. |
| Saving | Each action saves immediately. No staging, no "Save all". |
| Payments vs installments | Automatic: Payments fill the oldest unpaid installment first. No linking field. |
| Deposits | Reduce the balance only. They never fill installments. |
| Overview | Budget, Actual cost, Paid, Outstanding. Due and Overdue only when above zero. |
| Icon scope | All in-page actions. Account and recovery buttons keep text. |
| Extra simplifications | All four: More options, ⓘ tooltips, one Add pattern, Houses loan labels. |
| Renovation nav icon | Wrench, so it no longer matches the Houses icon. |

## 1. Data and rules (schema 9)

### Migration

`SCHEMA_VERSION` becomes 9. Loading or importing any older backup, including schema 8:

- Removes `renovationCategories`.
- Removes `categoryId` from every Renovation item.
- Removes `installmentMonth` from every Renovation payment.

Nothing else changes. Item names, notes, budgets, actual costs, plans and payments are kept.
Installment progress is calculated from payments, never stored.

### Item

- `name` is required. `notes`, `budget`, `actualCost` and `installmentPlan` are optional.
- At least one of `budget` or `actualCost` is required.
- Each item belongs to one house.

### Payment

- Fields: `id`, `itemId`, `date`, `amount`, `kind` (`deposit` or `payment`).
- A payment requires an item with an actual cost, a positive amount with at most two
  decimals, and a date no later than today (Malaysia time).
- Total deposits and payments cannot exceed the actual cost.

### Installment plan

- Fields: `startMonth`, `amount`, `count` (1–600). Requires an actual cost.
- Allocation: take the item's `payment`-kind entries in date order, then by id. Fill
  installments oldest first, up to each installment's amount. Anything left after every
  installment is covered reduces the balance only.
- Deposits are never allocated to installments.
- Rule: **deposits + plan total (amount × count) cannot exceed actual cost.** This replaces
  the old "unpaid scheduled amounts exceed outstanding" rule.
- **Due**: the uncovered part of the current month's installment.
- **Overdue**: the uncovered parts of installments before the current month.

### Saving and errors

- Each action saves the whole state at once: add or edit an item; add, edit or delete a
  payment; set or remove a plan; delete an item.
- Deleting an item also deletes its payments, after confirmation.
- If the new state breaks a rule, nothing is saved and the error appears next to the action.
  Errors name the item.

### Houses

A house with Renovation items still cannot be deleted. The category rule is removed.

## 2. Renovation screen

- **Header**: House dropdown. The intro paragraph becomes an ⓘ tooltip.
- **Overview** (page and Home): Budget, Actual cost, Paid, Outstanding. Due and Overdue
  appear only when above zero. Expected total, Unscheduled balance and both explanation
  paragraphs are removed.
- **Add item**: a collapsible **+ Add** panel with Name, Notes, Budget and Actual cost, and
  one ✓ button. The category section is removed.
- **Item card**:
  - Name, with ✎ Edit and 🗑 Delete.
  - Notes, if any.
  - Budget · Actual · Paid · Outstanding, plus the over- or under-budget difference when
    both budget and actual cost are set.
  - Plan line when a plan exists, for example
    "RM1,000 × 8 from Jan 2027 · 3 of 8 covered · RM1,000 due".
  - Payments list: date · amount · Deposit or Payment, each with ✎ and 🗑.
- **Inline icon buttons** on each item:
  - 💳 **Add payment**: Date, Amount, Deposit/Payment, then ✓ and ✕.
  - 📅 **Plan**: Start month, Amount, Count, then ✓ and ✕, plus 🗑 to remove an existing plan.
  - Both are disabled until an actual cost is set, with the tooltip "Set actual cost first".
- **Inline editors**: item, payment and plan editors open in place. Opening one closes any
  other open editor, with discard confirmation if it has changes. The existing no-scroll-jump
  and no-keyboard-focus behavior stays.
- **Home**: the Renovation summary uses the same tiles and the wrench icon.

## 3. App-wide changes

### Icon buttons

- In-page text buttons become icon buttons: + Add, ✓ Save, ✕ Cancel, ✎ Edit, 🗑 Delete,
  ⬇ Export and ⬆ Import.
- Each has an `aria-label` and a `title` tooltip.
- These keep their text: Sign in, Sign out, Try again, Retry save, Export unsaved changes,
  Export my current edits, Migrate this data, and Start with an empty account.
- New sprite icons: `i-save` (plain check), `i-tools` (wrench), `i-card` (payment),
  `i-calendar` (plan) and `i-info`.
- The Renovation nav link and Home section use `i-tools`. Houses keeps `i-home`.

### More options

- Expenses Add and Edit forms show Name, Amount (or Low/High) and Repeat first.
- From, Until and Scenario move under a **More options** disclosure.
- In the Houses form, Bank installment moves under **More options**.
- **More options** opens automatically when editing an entry that has any of those values.

### ⓘ tooltips

Long explanatory notes become ⓘ tooltips, starting with the Renovation intro. Error messages,
status messages and the Tightest month note stay visible.

### One Add pattern

Houses and Renovation use the same collapsible **+ Add** panel as Expenses. Spending keeps its
always-open form because it is the fastest daily entry.

### Houses loan labels

- The card shows "Loan term 420 months".
- It also shows "Projected payoff 416 payments · 4 months earlier" (or later). When the two
  match, it shows one line.
- Elapsed payments read "~46 paid (estimated)".
- Loan calculations do not change.

## Unchanged

- Accounting outside Renovation.
- Inline editing, focus and scroll handling.
- Last-write-wins account saves.
- Export and Import behavior, apart from the schema 9 upgrade.

## Testing

Test-first throughout.

- **Node**:
  - Schema 9 migration from schema 8 and older.
  - Installment allocation and Due/Overdue.
  - The deposits + plan rule and payment limits.
  - Immediate-save failures leave state unchanged.
  - House deletion and Houses label values.
- **Browser** (`npm run test:ui`):
  - Renovation tests rewritten for the new screen.
  - Icon buttons have accessible labels.
  - More options opens for entries with saved optional values.
  - Responsive checks at seven widths and two text sizes.
- `npm test`, `npm run build` and `git diff --check` must pass.

## Order of work

1. Finish the pending Home "Where income goes" fix as its own commit.
2. Renovation data and rules (schema 9).
3. Renovation screen.
4. App-wide icons, More options, ⓘ tooltips and the Add pattern.
5. Houses loan labels.
