import { test } from "node:test";
import assert from "node:assert/strict";
import { readBackup, exportBackup } from "../backup.js";
import { fixture } from "./helpers/renovation-fixture.js";

test("schema 7 upgrades without clearing nonempty Spending", () => {
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
  assert.deepEqual(result.state.renovationCategories, []);
  assert.deepEqual(result.state.renovationItems, []);
  assert.deepEqual(result.state.renovationPayments, []);
  assert.equal(result.notice, null);
});

test("schema 8 round-trips actual cost, deposits, and installment links", () => {
  const state = fixture();
  state.renovationPayments.push({
    id: "oct", itemId: "cabinets", date: "2026-10-14",
    amount: 400, kind: "payment", installmentMonth: "2026-10",
  });
  const file = exportBackup(state);
  assert.equal(JSON.parse(file).schemaVersion, 8);
  assert.deepEqual(readBackup(file).state, state);
});

test("schema 8 malformed renovation data is rejected rather than cleared", () => {
  for (const key of ["renovationCategories", "renovationItems", "renovationPayments"]) {
    for (const value of [undefined, null, "invalid", {}]) {
      const state = { ...fixture(), [key]: value };
      assert.throws(() => exportBackup(state), /not a valid backup/);
      assert.throws(() => readBackup(JSON.stringify({ schemaVersion: 8, data: state })), /not a valid backup/);
    }
  }
});

test("schema 8 rejects invalid financial and relational records on import and export", () => {
  const changes = [
    (state) => { state.renovationCategories[0].houseId = "missing"; },
    (state) => { state.renovationItems[0].categoryId = "missing"; },
    (state) => { state.renovationPayments[0].itemId = "missing"; },
    (state) => { state.renovationItems[0].actualCost = null; },
    (state) => { state.renovationItems[0].budget = 1.001; },
    (state) => { state.renovationItems[0].actualCost = 100; },
    (state) => { state.renovationItems[0].installmentPlan.amount = 2000; },
    (state) => { state.renovationPayments[0].installmentMonth = "2026-10"; },
    (state) => { state.renovationPayments[0].date = "9999-12-31"; },
    (state) => { state.renovationPayments.push({ ...state.renovationPayments[0] }); },
  ];
  for (const change of changes) {
    const state = fixture();
    change(state);
    assert.throws(() => exportBackup(state), /not a valid backup/);
    assert.throws(() => readBackup(JSON.stringify({ schemaVersion: 8, data: state })), /not a valid backup/);
  }
});

test("renovation export excludes extra fields at every record level", () => {
  const state = fixture();
  state.renovationCategories[0].extra = "private";
  state.renovationItems[0].extra = "private";
  state.renovationItems[0].installmentPlan.extra = "private";
  state.renovationPayments[0].extra = "private";
  assert.deepEqual(readBackup(exportBackup(state)).state, fixture());
});

test("schema 9 is rejected even with otherwise valid current data", () => {
  assert.throws(() => readBackup(JSON.stringify({ schemaVersion: 9, data: fixture() })), /newer version/);
});
