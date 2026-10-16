import { test } from "node:test";
import assert from "node:assert/strict";
import { readBackup, exportBackup } from "../backup.js";
import { renovationReport } from "../renovation.js";
import { fixture } from "./helpers/renovation-fixture.js";

const schema8 = () => {
  const data = fixture();
  data.renovationCategories = [{ id: "kitchen", houseId: "h1", name: "Kitchen" }];
  data.renovationItems[0].categoryId = "kitchen";
  data.renovationPayments.push(
    { id: "oct", itemId: "cabinets", date: "2026-10-01", amount: 1000, kind: "deposit", installmentMonth: "2026-10" },
    { id: "nov", itemId: "cabinets", date: "2026-10-02", amount: 400, kind: "payment", installmentMonth: "2026-11" },
  );
  return data;
};

test("schema 7 upgrades without clearing Spending and starts Renovation empty", () => {
  const spending = [{
    id: "s1", date: "2026-10-13", categoryId: "food", amount: 12.5, description: "Lunch",
  }];
  const file = JSON.stringify({
    schemaVersion: 7,
    data: {
      income: 5000, commitments: [], houses: [],
      lifestyle: [{ id: "food", name: "Food", low: 400, high: 600, everyMonths: 1 }],
      spending,
    },
  });
  const result = readBackup(file);
  assert.deepEqual(result.state.spending, spending);
  assert.equal("renovationCategories" in result.state, false);
  assert.deepEqual(result.state.renovationItems, []);
  assert.deepEqual(result.state.renovationPayments, []);
  assert.equal(result.notice, null);
});

test("schema 9 round-trips items, plans, deposits and payments", () => {
  const state = fixture();
  state.renovationPayments.push({
    id: "oct", itemId: "cabinets", date: "2026-10-14", amount: 400, kind: "payment",
  });
  const file = exportBackup(state);
  assert.equal(JSON.parse(file).schemaVersion, 9);
  assert.deepEqual(readBackup(file).state, state);
});

test("schema 8 drops categories and installment links and keeps names, amounts and plans", () => {
  const { state } = readBackup(JSON.stringify({ schemaVersion: 8, data: schema8() }));
  assert.equal("renovationCategories" in state, false);
  assert.deepEqual(state.renovationItems, fixture().renovationItems);
  assert.deepEqual(state.renovationPayments, [
    fixture().renovationPayments[0],
    { id: "oct", itemId: "cabinets", date: "2026-10-01", amount: 1000, kind: "payment" },
    { id: "nov", itemId: "cabinets", date: "2026-10-02", amount: 400, kind: "payment" },
  ]);
});

test("schema 8 linked deposits become payments so the migrated state stays valid", () => {
  const { state } = readBackup(JSON.stringify({ schemaVersion: 8, data: schema8() }));
  const report = renovationReport(state, "h1", "2026-10");
  assert.equal(report.totals.paid, 3400);
  assert.equal(report.totals.outstanding, 8600);
  assert.equal(report.items[0].covered, 1);
  assert.equal(report.totals.due, 0);
});

test("schema 8 with non-object renovation entries is rejected without crashing", () => {
  for (const key of ["renovationItems", "renovationPayments"]) {
    for (const entry of [null, "text", 5, []]) {
      const data = schema8();
      data[key].push(entry);
      assert.throws(() => readBackup(JSON.stringify({ schemaVersion: 8, data })), /not a valid backup/);
    }
  }
});

test("malformed renovation lists are rejected rather than cleared", () => {
  for (const key of ["renovationItems", "renovationPayments"]) {
    for (const value of [undefined, null, "invalid", {}]) {
      const state = { ...fixture(), [key]: value };
      assert.throws(() => exportBackup(state), /not a valid backup/);
      for (const schemaVersion of [8, 9]) {
        const data = schemaVersion === 8 ? { ...schema8(), [key]: value } : state;
        assert.throws(() => readBackup(JSON.stringify({ schemaVersion, data })), /not a valid backup/);
      }
    }
  }
});

test("invalid financial and relational records are rejected on import and export", () => {
  const changes = [
    (state) => { state.renovationPayments[0].itemId = "missing"; },
    (state) => { state.renovationItems[0].houseId = "missing"; },
    (state) => { state.renovationItems[0].actualCost = null; },
    (state) => { state.renovationItems[0].budget = 1.001; },
    (state) => { state.renovationItems[0].actualCost = 100; },
    (state) => { state.renovationItems[0].installmentPlan.amount = 2000; },
    (state) => { state.renovationPayments[0].date = "9999-12-31"; },
    (state) => { state.renovationPayments.push({ ...state.renovationPayments[0] }); },
  ];
  for (const change of changes) {
    const state = fixture();
    change(state);
    assert.throws(() => exportBackup(state), /not a valid backup/);
    assert.throws(() => readBackup(JSON.stringify({ schemaVersion: 9, data: state })), /not a valid backup/);
  }
});

test("export excludes extra and retired fields at every record level", () => {
  const state = fixture();
  state.renovationCategories = [{ id: "kitchen", houseId: "h1", name: "Kitchen" }];
  state.renovationItems[0].extra = "private";
  state.renovationItems[0].categoryId = "kitchen";
  state.renovationItems[0].installmentPlan.extra = "private";
  state.renovationPayments[0].extra = "private";
  state.renovationPayments[0].installmentMonth = "2026-10";
  assert.deepEqual(readBackup(exportBackup(state)).state, fixture());
});

test("schema 10 is rejected even with otherwise valid current data", () => {
  assert.throws(() => readBackup(JSON.stringify({ schemaVersion: 10, data: fixture() })), /newer version/);
});
