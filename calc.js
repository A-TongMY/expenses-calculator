// EPSILON rescues 1.005 (stored as 1.00499...); "+ 0" turns -0 into 0 so zero never prints as "-RM 0.00".
const roundToSen = (amount) =>
  (Math.sign(amount) * Math.round((Math.abs(amount) + Number.EPSILON) * 100)) / 100 + 0;

export function monthlyCost({ amount, everyMonths }) {
  return roundToSen(amount / everyMonths);
}

export function lifestyleMonthlyCost({ low, high, everyMonths }) {
  return {
    low: monthlyCost({ amount: low, everyMonths }),
    high: monthlyCost({ amount: high, everyMonths }),
  };
}

export function totalLifestyleCost(items) {
  const costs = items.map(lifestyleMonthlyCost);
  return {
    low: roundToSen(costs.reduce((sum, cost) => sum + cost.low, 0)),
    high: roundToSen(costs.reduce((sum, cost) => sum + cost.high, 0)),
  };
}

export function totalMonthlyCost(commitments) {
  return roundToSen(commitments.reduce((sum, c) => sum + monthlyCost(c), 0));
}

export function remaining({ income, commitments, lifestyle }) {
  const afterCommitments = income - totalMonthlyCost(commitments);
  const lifestyleCost = totalLifestyleCost(lifestyle);
  return {
    best: roundToSen(afterCommitments - lifestyleCost.low),
    worst: roundToSen(afterCommitments - lifestyleCost.high),
  };
}

const MIN_PROJECTION_MONTHS = 12;
const MAX_PROJECTION_MONTHS = 24;

const monthIndex = (month) => {
  const [year, number] = month.split("-").map(Number);
  return year * 12 + (number - 1);
};

const monthAt = (index) =>
  `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;

const activeIn = (items, month) =>
  items.filter(
    ({ startMonth, endMonth }) =>
      (!startMonth || startMonth <= month) && (!endMonth || month <= endMonth),
  );

export function projection({ income, commitments: allCommitments, lifestyle }, fromMonth) {
  const real = allCommitments.filter((commitment) => !commitment.scenario);
  const counted = allCommitments.filter((commitment) => !commitment.scenario || commitment.scenario.on);
  const from = monthIndex(fromMonth);
  const endIndexes = [...counted, ...lifestyle]
    .filter(({ endMonth }) => endMonth)
    .map(({ endMonth }) => monthIndex(endMonth));
  const latestEnd = Math.max(from, ...endIndexes);
  const length = Math.min(
    MAX_PROJECTION_MONTHS,
    Math.max(MIN_PROJECTION_MONTHS, latestEnd - from + 1),
  );
  return Array.from({ length }, (_, offset) => {
    const month = monthAt(from + offset);
    const activeLifestyle = activeIn(lifestyle, month);
    const figuresFor = (commitments) => {
      const active = activeIn(commitments, month);
      return {
        commitments: totalMonthlyCost(active),
        ...remaining({ income, commitments: active, lifestyle: activeLifestyle }),
      };
    };
    return {
      month,
      lifestyle: totalLifestyleCost(activeLifestyle),
      ...figuresFor(real),
      withScenarios: figuresFor(counted),
    };
  });
}

export function tightestMonth(months, { withScenarios = false } = {}) {
  const worstOf = (month) => (withScenarios ? month.withScenarios.worst : month.worst);
  return months.reduce((tightest, month) => (worstOf(month) < worstOf(tightest) ? month : tightest));
}
