import { test } from "node:test";
import assert from "node:assert/strict";
import { checkInTrend, expenseReport, housesReport } from "../reports.js";
import { compact, niceTicks, spreadIndexes } from "../charts.js";

const rent = { id: "c1", name: "Rent", amount: 1500, everyMonths: 1 };
const food = { id: "l1", name: "Food", low: 400, high: 600, everyMonths: 1 };
const base = { income: 6000, commitments: [rent], lifestyle: [food], checkIns: [], houses: [] };

test("the expense report adds up what is left this month", () => {
  const report = expenseReport(base, "2026-10");
  assert.equal(report.hasData, true);
  assert.equal(report.commitments, 1500);
  assert.deepEqual(report.left, { worst: 3900, best: 4100 });
  assert.equal(report.spent, 2100);
  assert.equal(report.spentShare, 0.35);
});

test("costs are sorted from biggest to smallest and use the high end for lifestyle", () => {
  const report = expenseReport({ ...base, commitments: [rent, { id: "c2", name: "Gym", amount: 100, everyMonths: 1 }] }, "2026-10");
  assert.deepEqual(report.costs.map((cost) => [cost.name, cost.value]), [["Rent", 1500], ["Food", 600], ["Gym", 100]]);
});

test("scenario commitments do not count in the costs", () => {
  const scenario = { id: "c3", name: "Car", amount: 900, everyMonths: 1, scenario: { on: true } };
  const report = expenseReport({ ...base, commitments: [rent, scenario] }, "2026-10");
  assert.equal(report.showScenarios, true);
  assert.equal(report.costs.some((cost) => cost.name === "Car"), false);
});

test("with no income there is no share of income", () => {
  assert.equal(expenseReport({ ...base, income: 0 }, "2026-10").spentShare, null);
});

test("an empty state has no data", () => {
  assert.equal(expenseReport({ ...base, income: 0, commitments: [], lifestyle: [] }, "2026-10").hasData, false);
});

test("check-ins are grouped by month, oldest first, and judged against the estimate", () => {
  const checkIns = [
    { month: "2026-09", itemId: "l1", name: "Food", low: 400, high: 600, actual: 650 },
    { month: "2026-09", itemId: "l2", name: "Fuel", low: 100, high: 200, actual: 150 },
    { month: "2026-08", itemId: "l1", name: "Food", low: 400, high: 600, actual: 300 },
  ];
  const trend = checkInTrend(checkIns);
  assert.deepEqual(trend.map((entry) => entry.month), ["2026-08", "2026-09"]);
  assert.deepEqual(trend[1], { month: "2026-09", items: 2, low: 500, high: 800, actual: 800, kind: "within" });
  assert.equal(trend[0].kind, "under");
});

test("only the most recent months of check-ins are kept", () => {
  const checkIns = Array.from({ length: 9 }, (_, index) => ({
    month: `2026-0${index + 1}`, itemId: "l1", name: "Food", low: 1, high: 2, actual: 1,
  }));
  assert.deepEqual(checkInTrend(checkIns, 6).map((entry) => entry.month), ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
});

const house = { id: "h1", name: "Terrace", loan: 100000, ratePercent: 4, termMonths: 360, startMonth: "2024-01" };
const other = { id: "h2", name: "Condo", loan: 50000, ratePercent: 3, termMonths: 120, startMonth: "2025-06" };

test("no houses means no data", () => {
  assert.equal(housesReport([], "2026-10").hasData, false);
});

test("the owed timeline starts at the loan and ends at zero", () => {
  const report = housesReport([house], "2026-10");
  assert.equal(report.timeline.months[0], "2024-01");
  assert.equal(report.timeline.months.at(-1), "2053-12");
  assert.equal(report.timeline.balance.at(-1), 0);
  assert.equal(report.timeline.months[report.timeline.nowIndex], "2026-10");
  assert.equal(report.timeline.balance[report.timeline.nowIndex], report.totals.outstanding);
});

test("two houses add up on the timeline, and a house that has not started counts as fully owed", () => {
  const report = housesReport([house, other], "2025-01");
  const now = report.timeline.nowIndex;
  assert.equal(report.timeline.balance[now], report.totals.outstanding);
  assert.ok(report.timeline.balance[now] > other.loan);
});

test("the yearly principal adds up to the loans and the yearly interest to the total interest", () => {
  const report = housesReport([house, other], "2026-10");
  const principal = report.years.reduce((total, year) => total + year.principal, 0);
  const interest = report.years.reduce((total, year) => total + year.interest, 0);
  assert.ok(Math.abs(principal - (house.loan + other.loan)) < 0.01);
  assert.ok(Math.abs(interest - report.totals.totalInterest) < 0.01);
});

test("the repaid share is principal paid over the loans", () => {
  const report = housesReport([house], "2060-01");
  assert.ok(report.repaidShare > 0.999);
});

test("compact shortens big numbers", () => {
  assert.equal(compact(950), "950");
  assert.equal(compact(1200), "1.2k");
  assert.equal(compact(-2500000), "-2.5M");
});

test("axis ticks are round and cover the data", () => {
  const { ticks, min, max } = niceTicks(2800, 4000);
  assert.ok(min <= 2800 && max >= 4000);
  assert.deepEqual(ticks, [2500, 3000, 3500, 4000]);
  assert.deepEqual(niceTicks(0, 0).ticks.length > 1, true);
});

test("label positions always include the first and last point", () => {
  assert.deepEqual(spreadIndexes(3, 4), [0, 1, 2]);
  const picks = spreadIndexes(360, 4);
  assert.equal(picks[0], 0);
  assert.equal(picks.at(-1), 359);
});
