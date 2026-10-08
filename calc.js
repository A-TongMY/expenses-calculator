// EPSILON fixes 1.005 (really 1.00499...); "+ 0" turns -0 into 0.
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

export const isActiveIn = ({ startMonth, endMonth }, month) =>
  (!startMonth || startMonth <= month) && (!endMonth || month <= endMonth);

const activeIn = (items, month) => items.filter((item) => isActiveIn(item, month));

const projectionLength = (items, from) => {
  const endIndexes = items.filter(({ endMonth }) => endMonth).map(({ endMonth }) => monthIndex(endMonth));
  const latestEnd = Math.max(from, ...endIndexes);
  return Math.min(MAX_PROJECTION_MONTHS, Math.max(MIN_PROJECTION_MONTHS, latestEnd - from + 1));
};

export function projection({ income, commitments: allCommitments, lifestyle }, fromMonth) {
  const real = allCommitments.filter((commitment) => !commitment.scenario);
  const counted = allCommitments.filter((commitment) => !commitment.scenario || commitment.scenario.on);
  const from = monthIndex(fromMonth);
  const baselineLength = projectionLength([...real, ...lifestyle], from);
  const length = projectionLength([...counted, ...lifestyle], from);
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
      inBaselineWindow: offset < baselineLength,
      withScenarios: figuresFor(counted),
    };
  });
}

export function tightestMonth(months, { withScenarios = false } = {}) {
  const candidates = withScenarios ? months : months.filter((month) => month.inBaselineWindow);
  const worstOf = (month) => (withScenarios ? month.withScenarios.worst : month.worst);
  return candidates.reduce((tightest, month) => (worstOf(month) < worstOf(tightest) ? month : tightest));
}

export function checkInGap({ low, high, actual }) {
  const under = roundToSen(low - actual);
  if (under > 0) return { kind: "under", amount: under };
  const over = roundToSen(actual - high);
  if (over > 0) return { kind: "over", amount: over };
  return { kind: "within", amount: 0 };
}

export function recordCheckIn(checkIns, item, month, actual) {
  const isSame = (checkIn) => checkIn.month === month && checkIn.itemId === item.id;
  const previous = checkIns.find(isSame);
  const { low, high } = lifestyleMonthlyCost(item);
  const checkIn = previous
    ? { ...previous, actual }
    : { month, itemId: item.id, name: item.name, low, high, actual };
  return [...checkIns.filter((other) => !isSame(other)), checkIn];
}
