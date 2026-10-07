const toSen = (amount) => Math.round(amount * 100) / 100 + 0;

export function monthlyCost({ amount, everyMonths }) {
  return amount / everyMonths;
}

export function totalMonthlyCost(commitments) {
  return toSen(commitments.reduce((sum, c) => sum + monthlyCost(c), 0));
}

export function remaining({ income, commitments }) {
  return toSen(income - totalMonthlyCost(commitments));
}
