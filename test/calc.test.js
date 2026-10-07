import { test } from "node:test";
import assert from "node:assert/strict";
import { monthlyCost, remaining, totalMonthlyCost } from "../calc.js";

test("a monthly expense costs its full amount each month", () => {
  assert.equal(monthlyCost({ amount: 850, everyMonths: 1 }), 850);
});

test("an expense paid every few months is spread evenly across those months", () => {
  assert.equal(monthlyCost({ amount: 150, everyMonths: 3 }), 50);
  assert.equal(monthlyCost({ amount: 1200, everyMonths: 12 }), 100);
});

test("remaining is income minus the monthly cost of every commitment", () => {
  const remainingAmount = remaining({
    income: 5000,
    commitments: [
      { amount: 1500, everyMonths: 1 },
      { amount: 1200, everyMonths: 12 },
    ],
  });
  assert.equal(remainingAmount, 3400);
});

test("remaining is rounded to the nearest sen so float noise never shows", () => {
  const remainingAmount = remaining({
    income: 0.3,
    commitments: [
      { amount: 0.1, everyMonths: 1 },
      { amount: 0.2, everyMonths: 1 },
    ],
  });
  assert.equal(remainingAmount, 0);
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
