import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers/renovation-fixture.js";
import { renovationMonth } from "../renovation-calendar.js";
import { projection } from "../calc.js";

const domain = await import("../renovation.js").catch(() => null);
test("the renovation domain exists", () => assert.ok(domain));

test("money uses exact sen and rejects invalid precision and range", () => {
  assert.equal(domain.toRenovationSen(0.29), 29);
  assert.equal(domain.toRenovationSen(1000000000), 100000000000);
  for (const value of [1.001, -1, Infinity, NaN, "1", 1000000001]) {
    assert.throws(() => domain.toRenovationSen(value), RangeError);
  }
});

test("money rejects nonnumeric primitive inputs with the documented validation error", () => {
  assert.throws(() => domain.toRenovationSen(Symbol("amount")), RangeError);
  assert.throws(() => domain.toRenovationSen(1n), RangeError);
});

test("canonical category and item names must be trimmed", () => {
  const category = fixture();
  category.renovationCategories[0].name = " Kitchen";
  assert.equal(domain.isValidRenovationState(category, "2026-10-14"), false);
  const item = fixture();
  item.renovationItems[0].name = "Cabinets ";
  assert.equal(domain.isValidRenovationState(item, "2026-10-14"), false);
});

test("deposits reduce outstanding and partial plans show unscheduled balance", () => {
  const state = fixture();
  const report = domain.renovationReport(state, "h1", "2026-10");
  assert.equal(report.totals.actualCost, 12000);
  assert.equal(report.totals.paid, 2000);
  assert.equal(report.totals.outstanding, 10000);
  assert.equal(report.totals.scheduledRemaining, 10000);
  assert.equal(report.totals.unscheduled, 0);
  assert.equal(report.totals.due, 1000);
  assert.equal(report.totals.overdue, 0);
  state.renovationItems[0].installmentPlan.count = 5;
  assert.equal(domain.renovationReport(state, "h1", "2026-10").totals.unscheduled, 5000);
});

test("linked partial payments and rollover never automatically increase paid", () => {
  const state = fixture();
  state.renovationPayments.push({
    id: "oct", itemId: "cabinets", date: "2026-10-14",
    amount: 400, kind: "payment", installmentMonth: "2026-10",
  });
  const october = domain.renovationReport(state, "h1", "2026-10");
  const november = domain.renovationReport(state, "h1", "2026-11");
  assert.equal(october.totals.paid, 2400);
  assert.equal(october.totals.outstanding, 9600);
  assert.equal(october.totals.due, 600);
  assert.equal(november.totals.paid, 2400);
  assert.equal(november.totals.overdue, 600);
  assert.equal(november.totals.due, 1000);
  assert.equal(october.items[0].installments[0].paymentStatus, "partial");
});

test("mixed expected costs compare only budgeted actual items", () => {
  const state = fixture();
  state.renovationItems.push(
    { id: "paint", houseId: "h1", categoryId: "kitchen", name: "Painting", budget: 3000 },
    { id: "extra", houseId: "h1", categoryId: "kitchen", name: "Extra", actualCost: 100 },
  );
  const { totals } = domain.renovationReport(state, "h1", "2026-10");
  assert.equal(totals.budgeted, 13000);
  assert.equal(totals.expected, 15100);
  assert.equal(totals.actualCost, 12100);
  assert.equal(totals.unbudgetedCount, 1);
  assert.equal(totals.gap, 2000);
  assert.equal(totals.comparedBudget, 10000);
  assert.equal(totals.comparedActual, 12000);
});

test("explicit zero actual is not replaced by a budget", () => {
  const state = fixture();
  state.renovationItems[0] = {
    id: "cabinets", houseId: "h1", categoryId: "kitchen", name: "Cabinets",
    budget: 100, actualCost: 0,
  };
  state.renovationPayments = [];
  assert.equal(domain.renovationReport(state, "h1", "2026-10").totals.expected, 0);
  delete state.renovationItems[0].actualCost;
  const report = domain.renovationReport(state, "h1", "2026-10");
  assert.equal(report.items[0].outstanding, null);
  assert.equal(report.totals.gap, null);
});

test("house-specific categories and reports do not mix matching names", () => {
  const state = fixture();
  state.houses.push({ ...state.houses[0], id: "h2", name: "House Two" });
  state.renovationCategories.push({ id: "k2", houseId: "h2", name: "Kitchen" });
  state.renovationItems.push({
    id: "i2", houseId: "h2", categoryId: "k2", name: "Cabinets", actualCost: 50,
  });
  assert.equal(domain.renovationReport(state, "h2", "2026-10").totals.actualCost, 50);
  assert.equal(domain.renovationReport(state, "h1", "2026-10").totals.actualCost, 12000);
});

test("financial and relational invalid states are rejected", () => {
  const changes = [
    (s) => { s.renovationCategories = null; },
    (s) => { s.renovationCategories[0].houseId = "missing"; },
    (s) => { s.renovationItems[0].categoryId = "missing"; },
    (s) => { s.renovationItems[0].houseId = "other"; },
    (s) => { s.renovationItems[0].actualCost = 100; },
    (s) => { s.renovationItems[0].budget = 1.001; },
    (s) => { s.renovationItems[0].installmentPlan.count = 601; },
    (s) => { s.renovationItems[0].installmentPlan.startMonth = "9999-12"; },
    (s) => { s.renovationItems[0].installmentPlan.amount = 2000; },
    (s) => { delete s.renovationItems[0].actualCost; },
    (s) => { s.renovationPayments[0].date = "2026-10-15"; },
    (s) => { s.renovationPayments[0].date = "2026-02-29"; },
    (s) => { s.renovationPayments[0].amount = 0; },
    (s) => { s.renovationPayments[0].kind = "other"; },
    (s) => { s.renovationPayments[0].installmentMonth = "2027-12"; },
    (s) => { s.renovationPayments[0].installmentMonth = "2026-10"; },
    (s) => { s.renovationItems.push({ ...s.renovationItems[0] }); },
  ];
  assert.equal(domain.isValidRenovationState(fixture(), "2026-10-14"), true);
  for (const change of changes) {
    const state = fixture();
    change(state);
    assert.equal(domain.isValidRenovationState(state, "2026-10-14"), false);
  }
});

test("list and text limits are enforced", () => {
  const state = fixture();
  state.renovationItems[0].notes = "x".repeat(501);
  assert.equal(domain.isValidRenovationState(state, "2026-10-14"), false);
  delete state.renovationItems[0].notes;
  state.renovationCategories = Array.from({ length: 2001 }, (_, index) => ({
    id: String(index), houseId: "h1", name: "Category",
  }));
  assert.equal(domain.isValidRenovationState(state, "2026-10-14"), false);
});

test("unlinking and schedule adjustment commits atomically without changing paid", () => {
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
  const next = domain.saveRenovationItem(state, item, payments, "2026-10-14");
  assert.equal(domain.renovationReport(next, "h1", "2026-10").totals.paid, 3000);
  assert.equal(domain.renovationReport(next, "h1", "2026-10").totals.outstanding, 9000);
  assert.equal(state.renovationPayments[1].installmentMonth, "2026-10");
  item.name = "Changed caller draft";
  assert.equal(next.renovationItems[0].name, "Cabinets");
});

test("allocated installments cannot be removed or changed without unlinking", () => {
  const state = fixture();
  state.renovationPayments.push({
    id: "oct", itemId: "cabinets", date: "2026-10-14",
    amount: 1000, kind: "payment", installmentMonth: "2026-10",
  });
  assert.throws(() => domain.saveRenovationItem(state, {
    ...state.renovationItems[0],
    installmentPlan: { startMonth: "2026-11", amount: 1000, count: 9 },
  }, state.renovationPayments, "2026-10-14"), /unlink/i);
  assert.throws(() => domain.saveRenovationItem(state, {
    ...state.renovationItems[0],
    installmentPlan: { startMonth: "2026-10", amount: 900, count: 10 },
  }, state.renovationPayments, "2026-10-14"), /unlink/i);
});

test("extra unlinked payments require simultaneous plan adjustment", () => {
  const state = fixture();
  const payments = [...state.renovationPayments, {
    id: "extra", itemId: "cabinets", date: "2026-10-14", amount: 1000, kind: "payment",
  }];
  assert.throws(() => domain.saveRenovationItem(
    state, state.renovationItems[0], payments, "2026-10-14",
  ), /scheduled|plan/i);
  const next = domain.saveRenovationItem(state, {
    ...state.renovationItems[0],
    installmentPlan: { startMonth: "2026-10", amount: 1000, count: 9 },
  }, payments, "2026-10-14");
  assert.equal(domain.renovationReport(next, "h1", "2026-10").totals.unscheduled, 0);
});

test("referenced houses and categories are guarded and item deletion is scoped", () => {
  const state = fixture();
  state.renovationItems.push({
    id: "paint", houseId: "h1", categoryId: "kitchen", name: "Painting", budget: 3000,
  });
  assert.throws(() => domain.assertHouseDeletionAllowed(state, "h1"), /renovation/i);
  assert.throws(() => domain.deleteRenovationCategory(state, "kitchen"), /item/i);
  const next = domain.deleteRenovationItem(state, "cabinets");
  assert.deepEqual(next.renovationPayments, []);
  assert.equal(next.renovationItems[0].id, "paint");
  assert.equal(state.renovationPayments.length, 1);
  assert.throws(() => domain.assertHouseDeletionAllowed({
    ...next, renovationItems: [],
  }, "h1"), /categor/i);
});

test("category renames propagate while ownership changes are rejected", () => {
  const state = fixture();
  const next = domain.saveRenovationCategory(state, {
    id: "kitchen", houseId: "h1", name: "Kitchen and dining",
  });
  assert.equal(domain.renovationReport(next, "h1").categories[0].name, "Kitchen and dining");
  assert.throws(() => domain.saveRenovationCategory(state, {
    id: "kitchen", houseId: "other", name: "Kitchen",
  }), /house/i);
});

test("multiple partial payments fully settle one installment without over-allocation", () => {
  const state = fixture();
  state.renovationPayments.push(
    { id: "part1", itemId: "cabinets", date: "2026-10-14", amount: 400, kind: "payment", installmentMonth: "2026-10" },
    { id: "part2", itemId: "cabinets", date: "2026-10-14", amount: 600, kind: "payment", installmentMonth: "2026-10" },
  );
  const report = domain.renovationReport(state, "h1", "2026-10");
  assert.equal(report.totals.paid, 3000);
  assert.equal(report.totals.outstanding, 9000);
  assert.equal(report.totals.due, 0);
  assert.equal(report.items[0].installments[0].paymentStatus, "paid");
  state.renovationPayments.push({
    id: "excess", itemId: "cabinets", date: "2026-10-14",
    amount: 0.01, kind: "payment", installmentMonth: "2026-10",
  });
  assert.equal(domain.isValidRenovationState(state, "2026-10-14"), false);
});

test("exactly 600 installments are supported with the correct final month", () => {
  const state = fixture();
  state.renovationItems[0].installmentPlan = { startMonth: "2026-10", amount: 10, count: 600 };
  const report = domain.renovationReport(state, "h1", "2026-10");
  assert.equal(report.items[0].installments.length, 600);
  assert.equal(report.items[0].installments[599].month, "2076-09");
  assert.equal(report.totals.scheduledRemaining, 6000);
  assert.equal(report.totals.unscheduled, 4000);
});

test("each list accepts exactly 2000 records and rejects the next record", () => {
  const categories = fixture();
  categories.renovationCategories.push(...Array.from({ length: 1999 }, (_, index) => ({
    id: `category-${index}`, houseId: "h1", name: "Category",
  })));
  assert.equal(domain.isValidRenovationState(categories, "2026-10-14"), true);
  categories.renovationCategories.push({ id: "overflow", houseId: "h1", name: "Category" });
  assert.equal(domain.isValidRenovationState(categories, "2026-10-14"), false);

  const items = fixture();
  items.renovationItems.push(...Array.from({ length: 1999 }, (_, index) => ({
    id: `item-${index}`, houseId: "h1", categoryId: "kitchen", name: "Item", budget: 0,
  })));
  assert.equal(domain.isValidRenovationState(items, "2026-10-14"), true);
  items.renovationItems.push({ id: "overflow", houseId: "h1", categoryId: "kitchen", name: "Item", budget: 0 });
  assert.equal(domain.isValidRenovationState(items, "2026-10-14"), false);

  const payments = fixture();
  payments.renovationPayments = Array.from({ length: 2000 }, (_, index) => ({
    id: `payment-${index}`, itemId: "cabinets", date: "2026-10-14", amount: 0.01, kind: "payment",
  }));
  assert.equal(domain.isValidRenovationState(payments, "2026-10-14"), true);
  payments.renovationPayments.push({
    id: "overflow", itemId: "cabinets", date: "2026-10-14", amount: 0.01, kind: "payment",
  });
  assert.equal(domain.isValidRenovationState(payments, "2026-10-14"), false);
});

test("name and notes limits accept the boundary and reject excess", () => {
  const state = fixture();
  state.renovationItems[0].name = "x".repeat(80);
  state.renovationItems[0].notes = "x".repeat(500);
  assert.equal(domain.isValidRenovationState(state, "2026-10-14"), true);
  state.renovationItems[0].name += "x";
  assert.equal(domain.isValidRenovationState(state, "2026-10-14"), false);
});

test("removing a plan with staged unlinks preserves payments as unscheduled balance", () => {
  const state = fixture();
  state.renovationPayments.push({
    id: "oct", itemId: "cabinets", date: "2026-10-14",
    amount: 400, kind: "payment", installmentMonth: "2026-10",
  });
  const { installmentPlan, ...item } = state.renovationItems[0];
  const payments = state.renovationPayments.map(({ installmentMonth, ...payment }) => payment);
  const next = domain.saveRenovationItem(state, item, payments, "2026-10-14");
  const report = domain.renovationReport(next, "h1", "2026-10");
  assert.equal(report.totals.paid, 2400);
  assert.equal(report.totals.unscheduled, 9600);
  assert.deepEqual(report.items[0].installments, []);
  assert.equal(state.renovationPayments[1].installmentMonth, "2026-10");
});

test("editing and deleting payments recalculates balances without changing actual cost", () => {
  const state = fixture();
  const edited = domain.saveRenovationItem(state, state.renovationItems[0], [{
    ...state.renovationPayments[0], amount: 1100,
  }], "2026-10-14");
  assert.equal(domain.renovationReport(edited, "h1").totals.unscheduled, 900);
  const removed = domain.saveRenovationItem(edited, edited.renovationItems[0], [], "2026-10-14");
  const report = domain.renovationReport(removed, "h1");
  assert.equal(report.totals.paid, 0);
  assert.equal(report.totals.actualCost, 12000);
  assert.equal(report.totals.outstanding, 12000);
  assert.equal(report.totals.unscheduled, 2000);
});

test("deleting one item preserves another item's payment records", () => {
  const state = fixture();
  state.renovationItems.push({
    id: "paint", houseId: "h1", categoryId: "kitchen", name: "Painting", actualCost: 100,
  });
  state.renovationPayments.push({
    id: "paint-payment", itemId: "paint", date: "2026-10-14", amount: 100, kind: "payment",
  });
  const next = domain.deleteRenovationItem(state, "cabinets", "2026-10-14");
  assert.deepEqual(next.renovationPayments, [{
    id: "paint-payment", itemId: "paint", date: "2026-10-14", amount: 100, kind: "payment",
  }]);
  assert.equal(next.renovationItems[0].id, "paint");
  assert.equal(state.renovationPayments.length, 2);
});

test("Malaysia month rollover changes overdue without creating payments", () => {
  const state = fixture();
  const october = domain.renovationReport(state, "h1", renovationMonth(new Date("2026-10-31T15:59:59Z")));
  const november = domain.renovationReport(state, "h1", renovationMonth(new Date("2026-10-31T16:00:00Z")));
  assert.equal(october.totals.overdue, 0);
  assert.equal(november.totals.overdue, 1000);
  assert.equal(october.totals.paid, 2000);
  assert.equal(november.totals.paid, 2000);
  assert.equal(state.renovationPayments.length, 1);
});

test("renovation budgets, actuals, deposits and plans do not change Expenses projections", () => {
  const state = fixture();
  state.income = 5000;
  const months = projection(state, "2026-10");
  assert.equal(months[0].best, 5000);
  assert.equal(months[0].worst, 5000);
  assert.equal(months[1].best, 5000);
  assert.equal(months[1].worst, 5000);
});
