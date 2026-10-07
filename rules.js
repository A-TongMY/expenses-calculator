export const MAX_AMOUNT = 1_000_000_000;
export const MAX_EVERY_MONTHS = 120;
export const MAX_NAME_LENGTH = 80;

export const isMoney = (value) =>
  Number.isFinite(value) && value >= 0 && value <= MAX_AMOUNT;

const isName = (name) =>
  typeof name === "string" && name.trim().length > 0 && name.length <= MAX_NAME_LENGTH;

const isCadence = (everyMonths) =>
  Number.isInteger(everyMonths) && everyMonths >= 1 && everyMonths <= MAX_EVERY_MONTHS;

export const isValidCommitment = (commitment) =>
  typeof commitment?.id === "string" &&
  isName(commitment.name) &&
  isMoney(commitment.amount) &&
  isCadence(commitment.everyMonths);

export const isValidLifestyle = (item) =>
  typeof item?.id === "string" &&
  isName(item.name) &&
  isMoney(item.low) &&
  isMoney(item.high) &&
  item.low <= item.high &&
  isCadence(item.everyMonths);
