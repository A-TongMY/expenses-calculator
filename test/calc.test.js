import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lifestyleMonthlyCost,
  monthlyCost,
  projection,
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
