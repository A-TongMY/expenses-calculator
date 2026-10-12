import { monthAt, monthIndex, roundToSen } from "./calc.js";

// A loan that is never repaid would run forever, so every schedule stops at this length.
export const MAX_SCHEDULE_MONTHS = 1200;

// Standard reducing-balance (monthly rest) instalment: interest is charged on the balance each month.
export function monthlyInstallment({ loan, ratePercent, termMonths }) {
  const rate = ratePercent / 100 / 12;
  if (rate === 0) return roundToSen(loan / termMonths);
  const growth = (1 + rate) ** termMonths;
  return roundToSen((loan * rate * growth) / (growth - 1));
}

// One row per payment. The first payment falls in startMonth. Without a fixed installment from the
// bank the last payment absorbs rounding, so the balance ends at exactly zero after termMonths.
export function loanSchedule(house) {
  const { loan, ratePercent, termMonths, startMonth } = house;
  const rate = ratePercent / 100 / 12;
  const fixed = house.installment !== undefined;
  const installment = fixed ? house.installment : monthlyInstallment(house);
  const from = monthIndex(startMonth);
  const rows = [];
  let balance = loan;
  while (balance > 0 && rows.length < MAX_SCHEDULE_MONTHS) {
    const interest = roundToSen(balance * rate);
    const owed = roundToSen(balance + interest);
    const isLast = !fixed && rows.length === termMonths - 1;
    const payment = isLast || installment >= owed ? owed : installment;
    const principal = roundToSen(payment - interest);
    balance = roundToSen(balance - principal);
    rows.push({
      number: rows.length + 1,
      month: monthAt(from + rows.length),
      payment,
      interest,
      principal,
      balance,
    });
  }
  return rows;
}

export function repaysInFull(house) {
  return loanSchedule(house).at(-1)?.balance === 0;
}

const total = (rows, key) => roundToSen(rows.reduce((sum, row) => sum + row[key], 0));

// Payments due up to and including asOfMonth count as made.
export function loanSummary(house, asOfMonth) {
  const rows = loanSchedule(house);
  const made = rows.filter((row) => row.month <= asOfMonth);
  const last = made.at(-1);
  const principalPaid = total(made, "principal");
  return {
    rows,
    installment: house.installment ?? monthlyInstallment(house),
    totalInterest: total(rows, "interest"),
    totalPayable: total(rows, "payment"),
    paymentsMade: made.length,
    paymentsTotal: rows.length,
    principalPaid,
    interestPaid: total(made, "interest"),
    outstanding: last ? last.balance : house.loan,
    progress: house.loan > 0 ? principalPaid / house.loan : 0,
    finalMonth: rows.at(-1).month,
    thisMonth: rows.find((row) => row.month === asOfMonth) ?? null,
    status: made.length === 0 ? "upcoming" : made.length === rows.length ? "paid off" : "active",
  };
}

export function housesOverview(houses, asOfMonth) {
  const summaries = houses.map((house) => loanSummary(house, asOfMonth));
  const sum = (pick) => roundToSen(summaries.reduce((acc, item) => acc + pick(item), 0));
  return {
    monthly: sum((item) => item.thisMonth?.payment ?? 0),
    outstanding: sum((item) => item.outstanding),
    principalPaid: sum((item) => item.principalPaid),
    interestPaid: sum((item) => item.interestPaid),
    totalInterest: sum((item) => item.totalInterest),
  };
}
