// EPSILON rescues 1.005 (stored as 1.00499...); "+ 0" turns -0 into 0 so zero never prints as "-RM 0.00".
const roundToSen = (amount) =>
  (Math.sign(amount) * Math.round((Math.abs(amount) + Number.EPSILON) * 100)) / 100 + 0;

export function monthlyCost({ amount, everyMonths }) {
  return roundToSen(amount / everyMonths);
}

export function totalMonthlyCost(commitments) {
  return roundToSen(commitments.reduce((sum, c) => sum + monthlyCost(c), 0));
}

export function remaining({ income, commitments }) {
  return roundToSen(income - totalMonthlyCost(commitments));
}
