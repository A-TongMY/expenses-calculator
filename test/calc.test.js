import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isActiveIn,
  checkInGap,
  lifestyleMonthlyCost,
  monthlyCost,
  projection,
  recordCheckIn,
  remaining,
  totalLifestyleCost,
  tightestMonth,
  totalMonthlyCost,
} from "../calc.js";

test("a monthly expense costs its full amount each month", () => {
  assert.equal(monthlyCost({ amount: 850, everyMonths: 1 }), 850);
});

test("an expense paid every few months is spread evenly across those months", () => {
  assert.equal(monthlyCost({ amount: 150, everyMonths: 3 }), 50);
  assert.equal(monthlyCost({ amount: 1200, everyMonths: 12 }), 100);
});

test("with no lifestyle spending, remaining is income minus every commitment's monthly cost", () => {
  const result = remaining({
    income: 5000,
    commitments: [
      { amount: 1500, everyMonths: 1 },
      { amount: 1200, everyMonths: 12 },
    ],
    lifestyle: [],
  });
  assert.deepEqual(result, { best: 3400, worst: 3400 });
});

test("remaining is rounded to the nearest sen so float noise never shows", () => {
  const result = remaining({
    income: 0.3,
    commitments: [
      { amount: 0.1, everyMonths: 1 },
      { amount: 0.2, everyMonths: 1 },
    ],
    lifestyle: [],
  });
  assert.deepEqual(result, { best: 0, worst: 0 });
});

test("remaining spans from every lifestyle item at its low to every item at its high", () => {
  const result = remaining({
    income: 5000,
    commitments: [{ amount: 1500, everyMonths: 1 }],
    lifestyle: [
      { low: 400, high: 600, everyMonths: 1 },
      { low: 120, high: 210, everyMonths: 3 },
    ],
  });
  assert.deepEqual(result, { best: 3060, worst: 2830 });
});

test("the total of commitments is their summed monthly cost, rounded to the sen", () => {
  const total = totalMonthlyCost([
    { amount: 0.1, everyMonths: 1 },
    { amount: 0.2, everyMonths: 1 },
    { amount: 1200, everyMonths: 12 },
  ]);
  assert.equal(total, 100.3);
});

test("a monthly cost that does not divide evenly is rounded to the sen", () => {
  assert.equal(monthlyCost({ amount: 100, everyMonths: 3 }), 33.33);
});

test("a cost that lands exactly halfway between two sen rounds up", () => {
  assert.equal(monthlyCost({ amount: 1.005, everyMonths: 1 }), 1.01);
});

test("the monthly costs shown for each row add up to the total", () => {
  const rows = [
    { amount: 100, everyMonths: 3 },
    { amount: 100, everyMonths: 3 },
    { amount: 100, everyMonths: 3 },
  ];
  assert.equal(totalMonthlyCost(rows), 99.99);
});

test("a lifestyle item costs a low and a high amount each month", () => {
  assert.deepEqual(lifestyleMonthlyCost({ low: 400, high: 600, everyMonths: 1 }), {
    low: 400,
    high: 600,
  });
});

test("lifestyle totals add up each item's low and high monthly cost", () => {
  const items = [
    { low: 400, high: 600, everyMonths: 1 },
    { low: 120, high: 210, everyMonths: 3 },
    { low: 0, high: 0.1, everyMonths: 1 },
    { low: 0, high: 0.2, everyMonths: 1 },
  ];
  assert.deepEqual(totalLifestyleCost(items), { low: 440, high: 670.3 });
});

test("with no lifestyle items the total is zero", () => {
  assert.deepEqual(totalLifestyleCost([]), { low: 0, high: 0 });
});

test("a lifestyle range paid every few months is spread and rounded to the sen at both ends", () => {
  assert.deepEqual(lifestyleMonthlyCost({ low: 120, high: 210, everyMonths: 3 }), {
    low: 40,
    high: 70,
  });
  assert.deepEqual(lifestyleMonthlyCost({ low: 100, high: 200, everyMonths: 3 }), {
    low: 33.33,
    high: 66.67,
  });
});

const state = {
  income: 5000,
  commitments: [{ amount: 1500, everyMonths: 1 }],
  lifestyle: [{ low: 400, high: 600, everyMonths: 1 }],
};

test("with no dates the projection is twelve identical months starting from the given month", () => {
  const months = projection(state, "2026-10");
  assert.equal(months.length, 12);
  assert.equal(months[0].month, "2026-10");
  assert.equal(months[11].month, "2027-09");
  for (const { best, worst } of months) {
    assert.deepEqual({ best, worst }, { best: 3100, worst: 2900 });
  }
});

test("a commitment stops counting after its end month, inclusive", () => {
  const months = projection(
    { ...state, commitments: [{ amount: 1500, everyMonths: 1, endMonth: "2026-12" }] },
    "2026-10",
  );
  assert.deepEqual(
    months.slice(0, 5).map(({ month, worst }) => [month, worst]),
    [
      ["2026-10", 2900],
      ["2026-11", 2900],
      ["2026-12", 2900],
      ["2027-01", 4400],
      ["2027-02", 4400],
    ],
  );
});

test("an expense does not count before its start month", () => {
  const months = projection(
    {
      ...state,
      commitments: [{ amount: 1500, everyMonths: 1 }],
      lifestyle: [{ low: 400, high: 600, everyMonths: 1, startMonth: "2026-12" }],
    },
    "2026-11",
  );
  assert.deepEqual(
    months.slice(0, 3).map(({ month, best, worst }) => [month, best, worst]),
    [
      ["2026-11", 3500, 3500],
      ["2026-12", 3100, 2900],
      ["2027-01", 3100, 2900],
    ],
  );
});

const endingAt = (endMonth) => ({
  ...state,
  commitments: [{ amount: 1500, everyMonths: 1, endMonth }],
});

test("the projection stays twelve months when every end month falls within them", () => {
  assert.equal(projection(endingAt("2027-03"), "2026-10").length, 12);
});

test("the projection runs through the latest end month when that is beyond twelve months", () => {
  const months = projection(endingAt("2028-06"), "2026-10");
  assert.equal(months.length, 21);
  assert.equal(months.at(-1).month, "2028-06");
});

test("the projection never runs beyond twenty-four months", () => {
  const months = projection(endingAt("2040-01"), "2026-10");
  assert.equal(months.length, 24);
  assert.equal(months.at(-1).month, "2028-09");
});

test("the tightest month is the one with the lowest worst case", () => {
  const months = projection(
    {
      ...state,
      commitments: [
        { amount: 1500, everyMonths: 1, endMonth: "2026-11" },
        { amount: 2500, everyMonths: 1, startMonth: "2027-01", endMonth: "2027-02" },
      ],
    },
    "2026-10",
  );
  assert.equal(tightestMonth(months).month, "2027-01");
});

test("when several months are equally tight the earliest is chosen", () => {
  assert.equal(tightestMonth(projection(state, "2026-10")).month, "2026-10");
});

test("each projected month carries that month's commitments and lifestyle totals", () => {
  const months = projection(
    {
      ...state,
      commitments: [
        { amount: 1500, everyMonths: 1 },
        { amount: 150, everyMonths: 1, endMonth: "2026-10" },
      ],
    },
    "2026-10",
  );
  assert.deepEqual(months[0].commitments, 1650);
  assert.deepEqual(months[1].commitments, 1500);
  assert.deepEqual(months[0].lifestyle, { low: 400, high: 600 });
});

test("a projection starting after every end month is still twelve months", () => {
  assert.equal(projection(endingAt("2026-09"), "2026-10").length, 12);
});

const withScenario = (on) => ({
  ...state,
  commitments: [
    { amount: 1500, everyMonths: 1 },
    { amount: 700, everyMonths: 1, scenario: { on } },
  ],
});

test("a switched-off scenario changes nothing", () => {
  const [first] = projection(withScenario(false), "2026-10");
  assert.deepEqual(first.withScenarios, { commitments: 1500, best: 3100, worst: 2900 });
  assert.equal(first.commitments, 1500);
});

test("a switched-on scenario counts in the with-scenarios figures but not in the baseline", () => {
  const [first] = projection(withScenario(true), "2026-10");
  assert.deepEqual(
    { commitments: first.commitments, best: first.best, worst: first.worst },
    { commitments: 1500, best: 3100, worst: 2900 },
  );
  assert.deepEqual(first.withScenarios, { commitments: 2200, best: 2400, worst: 2200 });
});

test("with no scenarios the with-scenarios figures equal the baseline", () => {
  const [first] = projection(state, "2026-10");
  assert.deepEqual(first.withScenarios, { commitments: 1500, best: 3100, worst: 2900 });
});

const scenarioEndingAt = (on) => ({
  ...state,
  commitments: [{ amount: 700, everyMonths: 1, endMonth: "2028-06", scenario: { on } }],
});

test("a switched-on scenario can extend the projection past twelve months", () => {
  assert.equal(projection(scenarioEndingAt(true), "2026-10").length, 21);
});

test("a switched-off scenario never extends the projection", () => {
  assert.equal(projection(scenarioEndingAt(false), "2026-10").length, 12);
});

test("the tightest month can be read for the baseline or with scenarios", () => {
  const months = projection(
    {
      ...state,
      commitments: [
        { amount: 1500, everyMonths: 1 },
        { amount: 2500, everyMonths: 1, startMonth: "2027-03", endMonth: "2027-03", scenario: { on: true } },
        { amount: 300, everyMonths: 1, startMonth: "2027-05", endMonth: "2027-05" },
      ],
    },
    "2026-10",
  );
  assert.equal(tightestMonth(months).month, "2027-05");
  assert.equal(tightestMonth(months, { withScenarios: true }).month, "2027-03");
});

const food = { low: 400, high: 600 };

test("spending below the estimate range is under by the shortfall", () => {
  assert.deepEqual(checkInGap({ ...food, actual: 350 }), { kind: "under", amount: 50 });
});

test("spending above the estimate range is over by the excess", () => {
  assert.deepEqual(checkInGap({ ...food, actual: 650 }), { kind: "over", amount: 50 });
});

test("spending inside the estimate range, including both ends, is within it", () => {
  for (const actual of [400, 500, 600]) {
    assert.deepEqual(checkInGap({ ...food, actual }), { kind: "within", amount: 0 });
  }
});

test("a gap is rounded to the sen so float noise never shows", () => {
  assert.deepEqual(checkInGap({ ...food, actual: 600.1 }), { kind: "over", amount: 0.1 });
});



const foodItem = { id: "l1", name: "Food", low: 400, high: 600, everyMonths: 1 };
const salonItem = { id: "l2", name: "Salon", low: 120, high: 210, everyMonths: 3 };
const septFood = { month: "2026-09", itemId: "l1", name: "Food", low: 400, high: 600, actual: 520 };
const octFood = { month: "2026-10", itemId: "l1", name: "Food", low: 400, high: 600, actual: 480 };

test("recording a first check-in snapshots the item's name and monthly estimate with what was spent", () => {
  assert.deepEqual(recordCheckIn([septFood], salonItem, "2026-10", 150), [
    septFood,
    { month: "2026-10", itemId: "l2", name: "Salon", low: 40, high: 70, actual: 150 },
  ]);
});

test("recording leaves the original list untouched", () => {
  const original = [septFood];
  recordCheckIn(original, salonItem, "2026-10", 150);
  assert.deepEqual(original, [septFood]);
});

test("recording again for the same item and month replaces the earlier actual", () => {
  const result = recordCheckIn([septFood, octFood], foodItem, "2026-10", 505);
  assert.deepEqual(result, [septFood, { ...octFood, actual: 505 }]);
});

test("updating a check-in never rewrites the name or estimate it was first compared against", () => {
  const edited = { ...foodItem, name: "Groceries", low: 900, high: 1200 };
  const result = recordCheckIn([octFood], edited, "2026-10", 505);
  assert.deepEqual(result, [{ month: "2026-10", itemId: "l1", name: "Food", low: 400, high: 600, actual: 505 }]);
});

test("an item is active from its start month to its end month inclusive, and always when it has neither", () => {
  const item = { startMonth: "2026-10", endMonth: "2026-12" };
  assert.equal(isActiveIn(item, "2026-09"), false);
  assert.equal(isActiveIn(item, "2026-10"), true);
  assert.equal(isActiveIn(item, "2026-12"), true);
  assert.equal(isActiveIn(item, "2027-01"), false);
  assert.equal(isActiveIn({}, "2026-10"), true);
});

test("a gap smaller than a sen counts as within the estimate", () => {
  assert.deepEqual(checkInGap({ low: 400, high: 600, actual: 600.004 }), { kind: "within", amount: 0 });
  assert.deepEqual(checkInGap({ low: 400, high: 600, actual: 399.996 }), { kind: "within", amount: 0 });
});

test("switching a scenario on or off does not move the baseline's tightest month", () => {
  const withLateScenario = (on) => ({
    income: 1000,
    commitments: [
      { amount: 900, everyMonths: 1, startMonth: "2027-12" },
      { amount: 50, everyMonths: 1, endMonth: "2028-06", scenario: { on } },
    ],
    lifestyle: [],
  });
  const off = projection(withLateScenario(false), "2026-10");
  const on = projection(withLateScenario(true), "2026-10");
  assert.equal(off.length, 12);
  assert.equal(on.length, 21);
  assert.equal(tightestMonth(off).month, "2026-10");
  assert.equal(tightestMonth(on).month, "2026-10");
  assert.equal(tightestMonth(on, { withScenarios: true }).month, "2027-12");
});
