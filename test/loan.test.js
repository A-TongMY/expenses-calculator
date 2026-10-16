import { test } from "node:test";
import assert from "node:assert/strict";
import { housesOverview, loanSchedule, loanSummary, loanTermLabels, monthlyInstallment, repaysInFull } from "../loan.js";
import { isValidHouse } from "../rules.js";

const house = { id: "h1", name: "Terrace", loan: 100000, ratePercent: 4, termMonths: 360, startMonth: "2024-01" };

test("the monthly installment of 100,000 at 4% over 30 years is 477.42", () => {
  assert.equal(monthlyInstallment(house), 477.42);
});

test("a loan with no interest is spread evenly over its term", () => {
  assert.equal(monthlyInstallment({ loan: 12000, ratePercent: 0, termMonths: 12 }), 1000);
});

test("the schedule has one row per month of the term and ends at exactly zero", () => {
  const rows = loanSchedule(house);
  assert.equal(rows.length, 360);
  assert.equal(rows.at(-1).balance, 0);
  assert.equal(rows[0].month, "2024-01");
  assert.equal(rows.at(-1).month, "2053-12");
});

test("the first month's interest is the balance times the monthly rate", () => {
  const [first] = loanSchedule(house);
  assert.equal(first.interest, 333.33);
  assert.equal(first.principal, 144.09);
  assert.equal(first.balance, 99855.91);
});

test("the principal repaid over the schedule adds up to the loan", () => {
  const rows = loanSchedule(house);
  const principal = rows.reduce((sum, row) => sum + row.principal, 0);
  assert.ok(Math.abs(principal - house.loan) < 0.005);
});

test("each payment is its interest plus its principal", () => {
  for (const row of loanSchedule(house)) {
    assert.ok(Math.abs(row.payment - row.interest - row.principal) < 0.005);
  }
});

test("the last payment only differs from the installment by rounding", () => {
  const rows = loanSchedule(house);
  assert.ok(Math.abs(rows.at(-1).payment - rows[0].payment) < 5);
});

test("a bank installment above the calculated one repays the loan sooner", () => {
  const rows = loanSchedule({ ...house, installment: 700 });
  assert.ok(rows.length < 360);
  assert.equal(rows.at(-1).balance, 0);
  assert.ok(rows.at(-1).payment <= 700);
});

test("a bank installment below the calculated one repays the loan later", () => {
  const rows = loanSchedule({ ...house, installment: 450 });
  assert.ok(rows.length > 360);
  assert.equal(rows.at(-1).balance, 0);
});

test("an installment that does not even cover the interest never repays the loan", () => {
  const stuck = { ...house, installment: 300 };
  assert.equal(repaysInFull(stuck), false);
  assert.equal(isValidHouse(stuck), false);
});

test("a loan scheduled to start in the future has made no payments", () => {
  const summary = loanSummary(house, "2023-12");
  assert.equal(summary.status, "upcoming");
  assert.equal(summary.paymentsMade, 0);
  assert.equal(summary.outstanding, 100000);
  assert.equal(summary.principalPaid, 0);
  assert.equal(summary.thisMonth, null);
});

test("payments due up to and including the given month count as made", () => {
  const summary = loanSummary(house, "2024-03");
  assert.equal(summary.status, "active");
  assert.equal(summary.paymentsMade, 3);
  assert.equal(summary.outstanding, summary.rows[2].balance);
  assert.equal(summary.thisMonth, summary.rows[2]);
  assert.ok(Math.abs(summary.principalPaid + summary.outstanding - house.loan) < 0.005);
});

test("a loan past its final month is paid off", () => {
  const summary = loanSummary(house, "2060-01");
  assert.equal(summary.status, "paid off");
  assert.equal(summary.outstanding, 0);
  assert.equal(summary.progress > 0.999, true);
});

test("total payable is the loan plus all the interest", () => {
  const summary = loanSummary(house, "2024-01");
  assert.ok(Math.abs(summary.totalPayable - house.loan - summary.totalInterest) < 0.01);
});

test("the overview adds up every house", () => {
  const other = { ...house, id: "h2", loan: 200000, startMonth: "2025-01" };
  const totals = housesOverview([house, other], "2025-01");
  const a = loanSummary(house, "2025-01");
  const b = loanSummary(other, "2025-01");
  assert.ok(Math.abs(totals.monthly - (a.thisMonth.payment + b.thisMonth.payment)) < 0.005);
  assert.ok(Math.abs(totals.outstanding - (a.outstanding + b.outstanding)) < 0.005);
});

test("a house that has not started adds nothing to this month's installments", () => {
  const totals = housesOverview([house], "2023-06");
  assert.equal(totals.monthly, 0);
  assert.equal(totals.outstanding, 100000);
});

const invalidHouses = {
  "a loan of zero": { loan: 0 },
  "a negative rate": { ratePercent: -1 },
  "a rate above 100": { ratePercent: 150 },
  "a term of zero months": { termMonths: 0 },
  "a term that is not a whole number of months": { termMonths: 12.5 },
  "a term longer than fifty years": { termMonths: 601 },
  "a start month that is not YYYY-MM": { startMonth: "March 2024" },
  "no start month": { startMonth: undefined },
  "a price below the loan": { price: 90000 },
  "an empty name": { name: "  " },
};

for (const [label, change] of Object.entries(invalidHouses)) {
  test(`a house with ${label} is not valid`, () => {
    assert.equal(isValidHouse({ ...house, ...change }), false);
  });
}

test("a house with a price, a rate of zero and a bank installment is valid", () => {
  assert.equal(isValidHouse({ ...house, price: 120000, ratePercent: 0, installment: 400 }), true);
});

test("a higher bank installment shows the 420-month term, an earlier projected payoff and estimated payments made", () => {
  const bank = { loan: 548499, ratePercent: 3.89, termMonths: 420, startMonth: "2023-01", installment: 2406 };
  assert.deepEqual(loanTermLabels(bank, loanSummary(bank, "2026-10")), {
    term: "420 months",
    payoff: "416 payments · 4 months earlier",
    paid: "~46 paid (estimated)",
  });
});

test("a lower bank installment projects a later payoff", () => {
  const low = { loan: 120000, ratePercent: 0, termMonths: 120, startMonth: "2024-01", installment: 900 };
  assert.equal(loanTermLabels(low, loanSummary(low, "2024-01")).payoff, "134 payments · 14 months later");
});

test("a standard installment pays off on its term, so no projected payoff is shown", () => {
  const labels = loanTermLabels(house, loanSummary(house, "2023-12"));
  assert.deepEqual(labels, { term: "360 months", payoff: null, paid: "~0 paid (estimated)" });
});

test("a one-month difference is singular", () => {
  const near = { loan: 12000, ratePercent: 0, termMonths: 12, startMonth: "2024-01", installment: 1100 };
  assert.equal(loanTermLabels(near, loanSummary(near, "2024-01")).payoff, "11 payments · 1 month earlier");
});