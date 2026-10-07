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
