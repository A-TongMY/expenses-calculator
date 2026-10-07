import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lifestyleMonthlyCost,
  monthlyCost,
  remaining,
  totalLifestyleCost,
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
