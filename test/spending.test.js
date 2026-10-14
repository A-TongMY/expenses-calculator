import { test } from "node:test";
import assert from "node:assert/strict";
import { currentDate, dateLabel } from "../format.js";
import { projection } from "../calc.js";
import * as rules from "../rules.js";

const spending = await import("../spending.js").catch(() => null);
assert.ok(spending, "the Spending domain module exists");

const food = { id: "food", name: "Food", low: 400, high: 600, everyMonths: 1 };
const transport = {
  id: "transport",
  name: "Transport",
  low: 120,
  high: 240,
  everyMonths: 3,
};
const state = {
  income: 5000,
  commitments: [],
  lifestyle: [food, transport],
  houses: [],
  spending: [],
  unrelated: { retained: true },
};
const lunch = {
  id: "s1",
  date: "2026-10-13",
  categoryId: "food",
  amount: 12.5,
  description: "Lunch",
};

test("deleting the last recorded category entry restores its estimates", () => {
  const recorded = spending.saveSpendingEntry(state, lunch);
  assert.equal(projection(recorded, "2026-10")[0].lifestyle.high, 92.5);
  const deleted = spending.deleteSpendingEntry(recorded, lunch.id);
  assert.equal(projection(deleted, "2026-10")[0].lifestyle.high, 680);
});

test("saving entries is immutable and editing retains identity", () => {
  const saved = spending.saveSpendingEntry(state, lunch);
  const edited = spending.saveSpendingEntry(saved, { ...lunch, amount: 15 });

  assert.deepEqual(state.spending, []);
  assert.equal(edited.spending.length, 1);
  assert.equal(edited.spending[0].id, "s1");
  assert.equal(edited.spending[0].amount, 15);
  assert.deepEqual(edited.unrelated, state.unrelated);
});

test("monthly metrics use all calendar days and include future dates", () => {
  const result = spending.spendingReport(
    { ...state, spending: [{ ...lunch, date: "2028-02-29", amount: 290 }] },
    "2028-02",
  );

  assert.equal(result.total, 290);
  assert.equal(result.count, 1);
  assert.equal(result.average, 10);
});

test("dates require real calendar days between 1900 and 9999", () => {
  assert.equal(rules.isDate("2024-02-29"), true);
  assert.equal(rules.isDate("2023-02-29"), false);
  assert.equal(rules.isDate("1900-01-01"), true);
  assert.equal(rules.isDate("1899-12-31"), false);
  assert.equal(rules.isDate("9999-12-31"), true);
  assert.equal(rules.isDate("10000-01-01"), false);
  assert.equal(rules.isDate("2026-04-31"), false);
  assert.equal(rules.isDate("2026-2-03"), false);
});

test("spending validation rejects invalid dates and inactive category months", () => {
  assert.equal(
    rules.isValidSpending({ ...lunch, date: "2026-02-29" }, [food]),
    false,
  );
  assert.equal(
    rules.isValidSpending(
      { ...lunch, date: "2026-09-30" },
      [{ ...food, startMonth: "2026-10" }],
    ),
    false,
  );
  assert.equal(
    rules.isValidSpending(
      { ...lunch, date: "2026-11-01" },
      [{ ...food, endMonth: "2026-10" }],
    ),
    false,
  );
  assert.equal(
    rules.isValidSpending(
      { ...lunch, date: "2026-10-01" },
      [{ ...food, startMonth: "2026-10", endMonth: "2026-10" }],
    ),
    true,
  );
});

test("spending validation requires a positive bounded finite amount", () => {
  for (const amount of [0, -0.01, -1, Number.NaN, Number.POSITIVE_INFINITY, rules.MAX_AMOUNT + 1]) {
    assert.equal(rules.isValidSpending({ ...lunch, amount }, [food]), false);
  }
  assert.equal(rules.isValidSpending({ ...lunch, amount: Number.MIN_VALUE }, [food]), true);
  assert.equal(rules.isValidSpending({ ...lunch, amount: rules.MAX_AMOUNT }, [food]), true);
});

test("spending validation requires a nonblank description up to 500 characters", () => {
  assert.equal(rules.isValidSpending({ ...lunch, description: "" }, [food]), false);
  assert.equal(rules.isValidSpending({ ...lunch, description: "  \t " }, [food]), false);
  assert.equal(rules.isValidSpending({ ...lunch, description: "x".repeat(501) }, [food]), false);
  assert.equal(rules.isValidSpending({ ...lunch, description: "x".repeat(500) }, [food]), true);
});

test("spending validation requires an existing category and string identities", () => {
  assert.equal(rules.isValidSpending({ ...lunch, categoryId: "missing" }, [food]), false);
  assert.equal(rules.isValidSpending({ ...lunch, categoryId: "" }, [food]), false);
  assert.equal(rules.isValidSpending({ ...lunch, id: "" }, [food]), false);
});

test("spending validation returns false for malformed Lifestyle lists", () => {
  assert.doesNotThrow(() => rules.isValidSpending(lunch, [null]));
  assert.equal(rules.isValidSpending(lunch, [null]), false);
});

test("saving invalid entries throws without changing the source state", () => {
  const before = structuredClone(state);

  assert.throws(
    () => spending.saveSpendingEntry(state, { ...lunch, amount: 0 }),
    /Invalid Spending entry/,
  );
  assert.deepEqual(state, before);
});

test("saving replaces an existing ID and appends a new ID", () => {
  const original = { ...lunch, amount: 10 };
  const withOriginal = { ...state, spending: [original] };
  const edited = spending.saveSpendingEntry(withOriginal, { ...lunch, amount: 20 });
  const appended = spending.saveSpendingEntry(edited, { ...lunch, id: "s2" });

  assert.deepEqual(edited.spending, [{ ...original, amount: 20 }]);
  assert.deepEqual(appended.spending.map(({ id }) => id), ["s1", "s2"]);
  assert.deepEqual(withOriginal.spending, [original]);
});

test("saving is limited to 2000 entries", () => {
  const atLimit = {
    ...state,
    spending: Array.from({ length: 2000 }, (_, index) => ({
      ...lunch,
      id: `s${index}`,
    })),
  };

  assert.throws(
    () => spending.saveSpendingEntry(atLimit, { ...lunch, id: "new-entry" }),
    /2000/,
  );
  assert.equal(atLimit.spending.length, 2000);
});

test("editing an entry at the limit does not count as adding", () => {
  const atLimit = {
    ...state,
    spending: Array.from({ length: 2000 }, (_, index) => ({
      ...lunch,
      id: `s${index}`,
    })),
  };

  const edited = spending.saveSpendingEntry(atLimit, {
    ...lunch,
    id: "s0",
    amount: 25,
  });

  assert.equal(edited.spending.length, 2000);
  assert.equal(edited.spending[0].amount, 25);
});

test("deleting an entry returns a new state and rejects unknown IDs", () => {
  const withEntry = { ...state, spending: [lunch] };
  const deleted = spending.deleteSpendingEntry(withEntry, "s1");

  assert.deepEqual(withEntry.spending, [lunch]);
  assert.deepEqual(deleted.spending, []);
  assert.deepEqual(deleted.unrelated, state.unrelated);
  assert.throws(() => spending.deleteSpendingEntry(withEntry, "missing"), /not found/i);
});

test("reports filter by month and category and sort newest-first stably", () => {
  const entries = [
    { ...lunch, id: "first", date: "2026-10-05", amount: 2.005 },
    { ...lunch, id: "nov", date: "2026-11-01", amount: 50 },
    { ...lunch, id: "second", date: "2026-10-20", amount: 10 },
    { ...lunch, id: "same-date", date: "2026-10-20", amount: 1 },
    { ...lunch, id: "transport", date: "2026-10-10", categoryId: "transport", amount: 3 },
  ];
  const report = spending.spendingReport({ ...state, spending: entries }, "2026-10");

  assert.deepEqual(report.entries.map(({ id }) => id), [
    "second",
    "same-date",
    "transport",
    "first",
  ]);
  assert.equal(report.total, 16.01);
  assert.equal(report.count, 4);
  assert.equal(report.average, 0.52);
  assert.deepEqual(report.categories, [
    { id: "food", name: "Food", amount: 13.01 },
    { id: "transport", name: "Transport", amount: 3 },
  ]);

  const selected = spending.spendingReport(
    { ...state, spending: entries },
    "2026-10",
    "transport",
  );
  assert.deepEqual(selected.entries.map(({ id }) => id), ["transport"]);
  assert.equal(selected.total, 3);
  assert.equal(selected.count, 1);
  assert.equal(selected.average, 0.1);
  assert.deepEqual(selected.categories, [{ id: "transport", name: "Transport", amount: 3 }]);
});

test("empty report results have zero metrics and no categories", () => {
  const report = spending.spendingReport(state, "2026-10");

  assert.deepEqual(report, {
    month: "2026-10",
    entries: [],
    total: 0,
    count: 0,
    average: 0,
    categories: [],
  });
});

test("report category labels use the current category name", () => {
  const report = spending.spendingReport(
    {
      ...state,
      lifestyle: [{ ...food, name: "Groceries" }, transport],
      spending: [lunch],
    },
    "2026-10",
  );

  assert.deepEqual(report.categories, [{ id: "food", name: "Groceries", amount: 12.5 }]);
});

test("spending comparisons group recorded category-month pairs against current estimates", () => {
  const result = spending.spendingComparisons({
    ...state,
    lifestyle: [{ ...food, name: "Groceries", low: 600, high: 900 }, transport],
    spending: [
      { ...lunch, id: "oct-food", amount: 20 },
      { ...lunch, id: "oct-food-2", amount: 10 },
      { ...lunch, id: "sep-food", date: "2026-09-02", amount: 5 },
      { ...lunch, id: "oct-transport", categoryId: "transport", amount: 7 },
    ],
  });

  assert.deepEqual(result, [
    { month: "2026-09", itemId: "food", name: "Groceries", low: 600, high: 900, actual: 5 },
    { month: "2026-10", itemId: "food", name: "Groceries", low: 600, high: 900, actual: 30 },
    { month: "2026-10", itemId: "transport", name: "Transport", low: 40, high: 80, actual: 7 },
  ]);
});

test("spending comparisons preserve category IDs containing separators", () => {
  const category = { ...food, id: "food:home" };
  const result = spending.spendingComparisons({
    ...state,
    lifestyle: [category],
    spending: [{ ...lunch, categoryId: category.id }],
  });

  assert.deepEqual(result, [
    {
      month: "2026-10",
      itemId: "food:home",
      name: "Food",
      low: 400,
      high: 600,
      actual: 12.5,
    },
  ]);
});

test("lifestyle guards reject referenced category removal and invalidating periods", () => {
  const withEntry = { ...state, spending: [lunch] };
  const before = structuredClone(withEntry);

  assert.throws(
    () => spending.assertLifestyleChangeAllowed(withEntry, [transport]),
    /reference/i,
  );
  assert.throws(
    () =>
      spending.assertLifestyleChangeAllowed(withEntry, [
        { ...food, endMonth: "2026-09" },
        transport,
      ]),
    /period|active/i,
  );
  assert.deepEqual(withEntry, before);
});

test("lifestyle guards allow renames and estimate changes for referenced categories", () => {
  assert.doesNotThrow(() =>
    spending.assertLifestyleChangeAllowed(
      { ...state, spending: [lunch] },
      [{ ...food, name: "Groceries", low: 500, high: 700 }, transport],
    ),
  );
});

test("date formatting uses local calendar components", () => {
  const expected = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;
  assert.equal(currentDate(), expected);
  assert.equal(dateLabel("2026-10-13"), "13 Oct 2026");
});
