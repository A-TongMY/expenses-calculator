import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers/renovation-fixture.js";
import { renovationMonth } from "../renovation-calendar.js";
import { projection } from "../calc.js";

const domain = await import("../renovation.js").catch(() => null);
const TODAY = "2026-10-14";
const pay = (id, amount, date = TODAY, kind = "payment") =>
  ({ id, itemId: "cabinets", date, amount, kind });

test("the renovation domain exists", () => assert.ok(domain));

test("money uses exact sen and rejects invalid precision and range", () => {
  assert.equal(domain.toRenovationSen(0.29), 29);
  assert.equal(domain.toRenovationSen(1000000000), 100000000000);
  for (const value of [1.001, -1, Infinity, NaN, "1", 1000000001, Symbol("x"), 1n]) {
    assert.throws(() => domain.toRenovationSen(value), RangeError);
  }
});

test("payments fill the oldest installment first and deposits never fill installments", () => {
  const plan = { startMonth: "2026-10", amount: 1000, count: 3 };
  const rows = domain.allocateInstallments(plan, [
    pay("b", 900, "2026-10-14"), pay("a", 600, "2026-10-01"), pay("d", 5000, TODAY, "deposit"),
  ], "2026-11");
  assert.deepEqual(rows, [
    { month: "2026-10", amount: 1000, covered: 1000, remaining: 0, dueStatus: "paid" },
    { month: "2026-11", amount: 1000, covered: 500, remaining: 500, dueStatus: "due" },
    { month: "2026-12", amount: 1000, covered: 0, remaining: 1000, dueStatus: "upcoming" },
  ]);
  const late = domain.allocateInstallments(plan, [pay("a", 400)], "2027-01");
  assert.deepEqual(late.map((row) => [row.covered, row.dueStatus]),
    [[400, "overdue"], [0, "overdue"], [0, "overdue"]]);
});

test("allocation beyond every installment only reduces the balance", () => {
  const plan = { startMonth: "2026-10", amount: 100, count: 2 };
  const rows = domain.allocateInstallments(plan, [pay("a", 250)], "2026-10");
  assert.deepEqual(rows.map((row) => row.remaining), [0, 0]);
});

test("allocation sums exact sen without floating point drift", () => {
  const plan = { startMonth: "2026-10", amount: 0.3, count: 1 };
  const rows = domain.allocateInstallments(plan, [pay("a", 0.1), pay("b", 0.2)], "2026-10");
  assert.equal(rows[0].remaining, 0);
  assert.equal(rows[0].dueStatus, "paid");
});

test("report shows budget, actual, paid, outstanding, due and overdue", () => {
  const state = fixture();
  state.renovationPayments.push(pay("p1", 1500));
  const october = domain.renovationReport(state, "h1", "2026-10");
  assert.deepEqual(october.totals, {
    budget: 10000, actualCost: 12000, paid: 3500, outstanding: 8500, due: 0, overdue: 0,
  });
  assert.equal(october.items[0].covered, 1);
  const november = domain.renovationReport(state, "h1", "2026-11");
  assert.equal(november.totals.due, 500);
  const december = domain.renovationReport(state, "h1", "2026-12");
  assert.equal(december.totals.overdue, 500);
  assert.equal(december.totals.due, 1000);
  assert.equal(december.totals.paid, 3500);
});

test("report lists payments by date then id and has no categories", () => {
  const state = fixture();
  state.renovationPayments.push(pay("z", 1, "2026-10-02"), pay("a", 1, "2026-10-02"));
  const report = domain.renovationReport(state, "h1", "2026-10");
  assert.deepEqual(report.items[0].payments.map(({ id }) => id), ["deposit", "a", "z"]);
  assert.equal("categories" in report, false);
});

test("items without actual cost count budget only and have no outstanding", () => {
  const state = fixture();
  state.renovationItems.push({ id: "paint", houseId: "h1", name: "Painting", budget: 3000 });
  const report = domain.renovationReport(state, "h1", "2026-10");
  assert.equal(report.totals.budget, 13000);
  assert.equal(report.totals.actualCost, 12000);
  assert.equal(report.items[1].outstanding, null);
  assert.equal(report.items[1].actualCost, null);
});

test("reports are scoped to one house", () => {
  const state = fixture();
  state.houses.push({ ...state.houses[0], id: "h2", name: "House Two" });
  state.renovationItems.push({ id: "i2", houseId: "h2", name: "Cabinets", actualCost: 50 });
  assert.equal(domain.renovationReport(state, "h2", "2026-10").totals.actualCost, 50);
  assert.equal(domain.renovationReport(state, "h1", "2026-10").totals.actualCost, 12000);
});

test("invalid states are rejected", () => {
  const changes = [
    (s) => { s.renovationItems = null; },
    (s) => { s.renovationItems[0].houseId = "other"; },
    (s) => { s.renovationItems[0].name = " Cabinets"; },
    (s) => { s.renovationItems[0].budget = 1.001; },
    (s) => { delete s.renovationItems[0].budget; delete s.renovationItems[0].actualCost; delete s.renovationItems[0].installmentPlan; s.renovationPayments = []; },
    (s) => { s.renovationItems[0].installmentPlan.count = 601; },
    (s) => { s.renovationItems[0].installmentPlan.startMonth = "9999-12"; },
    (s) => { s.renovationItems[0].installmentPlan.amount = 1001; },
    (s) => { delete s.renovationItems[0].actualCost; },
    (s) => { s.renovationPayments[0].date = "2026-10-15"; },
    (s) => { s.renovationPayments[0].date = "2026-02-29"; },
    (s) => { s.renovationPayments[0].amount = 0; },
    (s) => { s.renovationPayments[0].kind = "other"; },
    (s) => { s.renovationPayments[0].itemId = "missing"; },
    (s) => { s.renovationItems.push({ ...s.renovationItems[0] }); },
  ];
  assert.equal(domain.isValidRenovationState(fixture(), TODAY), true);
  for (const change of changes) {
    const state = fixture();
    change(state);
    assert.equal(domain.isValidRenovationState(state, TODAY), false, change.toString());
  }
});

test("deposits plus the plan total may equal but not exceed actual cost", () => {
  const state = fixture();
  assert.equal(domain.isValidRenovationState(state, TODAY), true);
  state.renovationPayments[0].amount = 2000.01;
  assert.equal(domain.isValidRenovationState(state, TODAY), false);
});

test("payments beyond the plan are allowed up to actual cost", () => {
  const state = fixture();
  state.renovationPayments.push(pay("p1", 10000));
  assert.equal(domain.isValidRenovationState(state, TODAY), true);
  state.renovationPayments.push(pay("p2", 0.01));
  assert.equal(domain.isValidRenovationState(state, TODAY), false);
});

test("list, name and notes limits accept the boundary and reject excess", () => {
  const state = fixture();
  state.renovationItems[0].name = "x".repeat(80);
  state.renovationItems[0].notes = "x".repeat(500);
  assert.equal(domain.isValidRenovationState(state, TODAY), true);
  state.renovationItems[0].notes += "x";
  assert.equal(domain.isValidRenovationState(state, TODAY), false);

  const items = fixture();
  items.renovationItems.push(...Array.from({ length: 1999 }, (_, index) => ({
    id: `item-${index}`, houseId: "h1", name: "Item", budget: 0,
  })));
  assert.equal(domain.isValidRenovationState(items, TODAY), true);
  items.renovationItems.push({ id: "overflow", houseId: "h1", name: "Item", budget: 0 });
  assert.equal(domain.isValidRenovationState(items, TODAY), false);
});

test("saving an item adds or edits it and always keeps the existing plan", () => {
  const state = fixture();
  const added = domain.saveRenovationItem(state,
    { id: "paint", houseId: "h1", name: "Painting", budget: 3000 }, TODAY);
  assert.equal(added.renovationItems.length, 2);
  assert.equal(state.renovationItems.length, 1);
  const draft = { id: "cabinets", houseId: "h1", name: "Kitchen cabinets", budget: 11000, actualCost: 12000 };
  const edited = domain.saveRenovationItem(state, draft, TODAY);
  assert.equal(edited.renovationItems[0].name, "Kitchen cabinets");
  assert.deepEqual(edited.renovationItems[0].installmentPlan,
    { startMonth: "2026-10", amount: 1000, count: 10 });
  draft.name = "Changed caller draft";
  assert.equal(edited.renovationItems[0].name, "Kitchen cabinets");
});

test("item errors name the item and leave state unchanged", () => {
  const state = fixture();
  const before = structuredClone(state);
  assert.throws(() => domain.saveRenovationItem(state,
    { id: "cabinets", houseId: "h1", name: "Cabinets", budget: 10000 }, TODAY), /^RangeError: Cabinets: /);
  assert.throws(() => domain.saveRenovationItem(state,
    { id: "cabinets", houseId: "h1", name: "Cabinets", actualCost: 11000 }, TODAY), /Cabinets: .*exceed/i);
  assert.throws(() => domain.saveRenovationItem(state,
    { id: "cabinets", houseId: "h2", name: "Cabinets", actualCost: 12000 }, TODAY), /another house/);
  assert.deepEqual(state, before);
});

test("setting and removing a plan saves immediately and enforces the deposit rule", () => {
  const state = fixture();
  const plan = { startMonth: "2026-11", amount: 500, count: 20 };
  const next = domain.setInstallmentPlan(state, "cabinets", plan, TODAY);
  assert.deepEqual(next.renovationItems[0].installmentPlan, plan);
  plan.count = 1;
  assert.equal(next.renovationItems[0].installmentPlan.count, 20);
  const removed = domain.setInstallmentPlan(next, "cabinets", null, TODAY);
  assert.equal("installmentPlan" in removed.renovationItems[0], false);
  assert.throws(() => domain.setInstallmentPlan(state, "cabinets",
    { startMonth: "2026-11", amount: 1000, count: 11 }, TODAY), /Cabinets: Deposits plus/);
  assert.throws(() => domain.setInstallmentPlan(state, "missing", null, TODAY), /no longer exists/);
});

test("a plan requires an actual cost", () => {
  const state = fixture();
  state.renovationItems.push({ id: "paint", houseId: "h1", name: "Painting", budget: 3000 });
  assert.throws(() => domain.setInstallmentPlan(state, "paint",
    { startMonth: "2026-11", amount: 100, count: 2 }, TODAY), /Painting: /);
});

test("payments are added, edited and deleted one at a time", () => {
  const state = fixture();
  const added = domain.saveRenovationPayment(state, pay("p1", 1500), TODAY);
  assert.equal(domain.renovationReport(added, "h1", "2026-10").totals.paid, 3500);
  const edited = domain.saveRenovationPayment(added, pay("p1", 500), TODAY);
  assert.equal(domain.renovationReport(edited, "h1", "2026-10").totals.paid, 2500);
  const deleted = domain.deleteRenovationPayment(edited, "p1", TODAY);
  assert.deepEqual(deleted.renovationPayments, state.renovationPayments);
  assert.equal(state.renovationPayments.length, 1);
  assert.throws(() => domain.deleteRenovationPayment(state, "missing", TODAY), /no longer exists/);
});

test("payment errors name the item and leave state unchanged", () => {
  const state = fixture();
  const before = structuredClone(state);
  assert.throws(() => domain.saveRenovationPayment(state, pay("p1", 10000.01), TODAY), /Cabinets: .*exceed/i);
  assert.throws(() => domain.saveRenovationPayment(state, pay("p1", 1, "2026-10-15"), TODAY), /Cabinets: /);
  assert.throws(() => domain.saveRenovationPayment(state, pay("p1", 1, TODAY, "deposit"), TODAY), /Cabinets: Deposits plus/);
  state.renovationItems.push({ id: "paint", houseId: "h1", name: "Painting", actualCost: 100 });
  const moved = { ...state.renovationPayments[0], itemId: "paint" };
  assert.throws(() => domain.saveRenovationPayment(state, moved, TODAY), /cannot be moved to another item/);
  state.renovationItems.pop();
  assert.deepEqual(state, before);
});

test("deleting an item removes only its payments", () => {
  const state = fixture();
  state.renovationItems.push({ id: "paint", houseId: "h1", name: "Painting", actualCost: 100 });
  state.renovationPayments.push({ id: "pp", itemId: "paint", date: TODAY, amount: 100, kind: "payment" });
  const next = domain.deleteRenovationItem(state, "cabinets", TODAY);
  assert.deepEqual(next.renovationItems.map(({ id }) => id), ["paint"]);
  assert.deepEqual(next.renovationPayments.map(({ id }) => id), ["pp"]);
  assert.equal(state.renovationPayments.length, 2);
  assert.throws(() => domain.deleteRenovationItem(state, "missing", TODAY), /no longer exists/);
});

test("a house with renovation items cannot be deleted", () => {
  const state = fixture();
  assert.throws(() => domain.assertHouseDeletionAllowed(state, "h1"), /renovation/i);
  assert.doesNotThrow(() => domain.assertHouseDeletionAllowed({ ...state, renovationItems: [] }, "h1"));
});

test("category operations no longer exist", () => {
  assert.equal(domain.saveRenovationCategory, undefined);
  assert.equal(domain.deleteRenovationCategory, undefined);
});

test("Malaysia month rollover changes due and overdue without creating payments", () => {
  const state = fixture();
  const october = domain.renovationReport(state, "h1", renovationMonth(new Date("2026-10-31T15:59:59Z")));
  const november = domain.renovationReport(state, "h1", renovationMonth(new Date("2026-10-31T16:00:00Z")));
  assert.equal(october.totals.overdue, 0);
  assert.equal(october.totals.due, 1000);
  assert.equal(november.totals.overdue, 1000);
  assert.equal(november.totals.paid, 2000);
});

test("exactly 600 installments are supported with the correct final month", () => {
  const state = fixture();
  state.renovationItems[0].installmentPlan = { startMonth: "2026-10", amount: 10, count: 600 };
  const report = domain.renovationReport(state, "h1", "2026-10");
  assert.equal(report.items[0].installments.length, 600);
  assert.equal(report.items[0].installments[599].month, "2076-09");
});

test("renovation does not change Expenses projections", () => {
  const state = fixture();
  state.income = 5000;
  const months = projection(state, "2026-10");
  assert.equal(months[0].best, 5000);
  assert.equal(months[1].worst, 5000);
});
