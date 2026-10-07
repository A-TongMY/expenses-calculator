export const MAX_AMOUNT = 1_000_000_000;
export const MAX_EVERY_MONTHS = 120;
export const MAX_NAME_LENGTH = 80;

export const isMoney = (value) =>
  Number.isFinite(value) && value >= 0 && value <= MAX_AMOUNT;

export function isValidCommitment(commitment) {
  return (
    typeof commitment?.id === "string" &&
    typeof commitment?.name === "string" &&
    commitment.name.trim().length > 0 &&
    commitment.name.length <= MAX_NAME_LENGTH &&
    isMoney(commitment.amount) &&
    Number.isInteger(commitment.everyMonths) &&
    commitment.everyMonths >= 1 &&
    commitment.everyMonths <= MAX_EVERY_MONTHS
  );
}
