// Turns the saved state into the numbers the Home dashboard draws. No DOM here, so it is easy to test.
import {
  checkInGap,
  isActiveIn,
  monthAt,
  monthIndex,
  monthlyCost,
  projection,
  roundToSen,
  tightestMonth,
} from "./calc.js";
import { housesOverview, loanSummary } from "./loan.js";
import { spendingComparisons } from "./spending.js";

const sum = (items, pick) => roundToSen(items.reduce((total, item) => total + pick(item), 0));

// Check-ins grouped by month, oldest first, for the most recent `limit` months.
export function checkInTrend(checkIns, limit = 6) {
  const byMonth = new Map();
  for (const checkIn of checkIns) {
    const entry = byMonth.get(checkIn.month) ?? { month: checkIn.month, low: 0, high: 0, actual: 0, items: 0 };
    entry.low += checkIn.low;
    entry.high += checkIn.high;
    entry.actual += checkIn.actual;
    entry.items += 1;
    byMonth.set(checkIn.month, entry);
  }
  return [...byMonth.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-limit)
    .map((entry) => {
      const low = roundToSen(entry.low);
      const high = roundToSen(entry.high);
      const actual = roundToSen(entry.actual);
      return { month: entry.month, items: entry.items, low, high, actual, kind: checkInGap({ low, high, actual }).kind };
    });
}

export function expenseReport(state, month) {
  const months = projection(state, month);
  const now = months[0];
  const income = state.income;
  const hasData = income > 0 || state.commitments.length > 0 || state.lifestyle.length > 0;

  const costs = [
    ...state.commitments
      .filter((item) => !item.scenario && isActiveIn(item, month))
      .map((item) => ({ id: item.id, name: item.name, kind: "commitment", value: monthlyCost(item) })),
    ...now.lifestyle.items
      .map((item) => ({ id: item.id, name: item.name, kind: "lifestyle", value: item.high })),
  ]
    .filter((cost) => cost.value > 0)
    .sort((a, b) => b.value - a.value);

  const spent = roundToSen(now.commitments + now.lifestyle.high);
  return {
    hasData,
    income,
    months,
    showScenarios: state.commitments.some((item) => item.scenario?.on),
    left: { worst: now.worst, best: now.best },
    commitments: now.commitments,
    lifestyle: now.lifestyle,
    spent,
    spentShare: income > 0 ? spent / income : null,
    tightest: tightestMonth(months),
    costs,
    actuals: checkInTrend(spendingComparisons(state)),
  };
}

export function housesReport(houses, month) {
  if (houses.length === 0) return { hasData: false };
  const items = houses.map((house) => ({ house, summary: loanSummary(house, month) }));
  const totals = housesOverview(houses, month);
  const loanTotal = sum(houses, (house) => house.loan);

  const nowIndex = monthIndex(month);
  const startIndex = Math.min(nowIndex, ...houses.map((house) => monthIndex(house.startMonth)));
  const endIndex = Math.max(nowIndex, ...items.map(({ summary }) => monthIndex(summary.finalMonth)));

  const months = [];
  const balance = [];
  for (let index = startIndex; index <= endIndex; index += 1) {
    months.push(monthAt(index));
    balance.push(
      sum(items, ({ house, summary }) => {
        const first = monthIndex(house.startMonth);
        if (index < first) return house.loan;
        return summary.rows[index - first]?.balance ?? 0;
      }),
    );
  }

  const byYear = new Map();
  for (const { summary } of items) {
    for (const row of summary.rows) {
      const year = row.month.slice(0, 4);
      const entry = byYear.get(year) ?? { year, principal: 0, interest: 0 };
      entry.principal += row.principal;
      entry.interest += row.interest;
      byYear.set(year, entry);
    }
  }
  const years = [...byYear.values()]
    .sort((a, b) => a.year.localeCompare(b.year))
    .map((entry) => ({ ...entry, principal: roundToSen(entry.principal), interest: roundToSen(entry.interest) }));

  return {
    hasData: true,
    totals,
    items,
    loanTotal,
    repaidShare: loanTotal > 0 ? totals.principalPaid / loanTotal : 0,
    timeline: { months, balance, nowIndex: nowIndex - startIndex },
    years,
  };
}
