import { repaysInFull } from "./loan.js";

export const MAX_AMOUNT = 1_000_000_000;
export const MAX_EVERY_MONTHS = 120;
export const MAX_NAME_LENGTH = 80;
export const MAX_DESCRIPTION_LENGTH = 500;
export const MAX_ITEMS = 2000;
export const MAX_HOUSES = 50;
export const MAX_TERM_MONTHS = 600;
export const MAX_RATE_PERCENT = 100;

export const isMoney = (value) =>
  Number.isFinite(value) && value >= 0 && value <= MAX_AMOUNT;

const isName = (name) =>
  typeof name === "string" && name.trim().length > 0 && name.length <= MAX_NAME_LENGTH;

const isCadence = (everyMonths) =>
  Number.isInteger(everyMonths) && everyMonths >= 1 && everyMonths <= MAX_EVERY_MONTHS;

export const isMonth = (value) => typeof value === "string" && /^(19\d{2}|[2-9]\d{3})-(0[1-9]|1[0-2])$/.test(value);

export const isDate = (value) => {
  if (typeof value !== "string") return false;
  const match = /^(19\d{2}|[2-9]\d{3})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
};

const isPeriod = ({ startMonth, endMonth }) =>
  (startMonth === undefined || isMonth(startMonth)) &&
  (endMonth === undefined || isMonth(endMonth)) &&
  (startMonth === undefined || endMonth === undefined || startMonth <= endMonth);

const isScenario = (scenario) =>
  scenario === undefined || typeof scenario?.on === "boolean";

export const isValidCommitment = (commitment) =>
  typeof commitment?.id === "string" &&
  isName(commitment.name) &&
  isMoney(commitment.amount) &&
  isCadence(commitment.everyMonths) &&
  isPeriod(commitment) &&
  isScenario(commitment.scenario);

export const isValidLifestyle = (item) =>
  typeof item?.id === "string" &&
  isName(item.name) &&
  isMoney(item.low) &&
  isMoney(item.high) &&
  item.low <= item.high &&
  isCadence(item.everyMonths) &&
  isPeriod(item);

export const isValidCheckIn = (checkIn) =>
  isMonth(checkIn?.month) &&
  typeof checkIn?.itemId === "string" &&
  isName(checkIn.name) &&
  isMoney(checkIn.low) &&
  isMoney(checkIn.high) &&
  checkIn.low <= checkIn.high &&
  isMoney(checkIn.actual);

export const isValidSpending = (entry, lifestyle) => {
  if (
    typeof entry?.id !== "string" ||
    !entry.id.trim() ||
    !isDate(entry.date) ||
    typeof entry.categoryId !== "string" ||
    !entry.categoryId.trim() ||
    !Number.isFinite(entry.amount) ||
    entry.amount <= 0 ||
    entry.amount > MAX_AMOUNT ||
    typeof entry.description !== "string" ||
    !entry.description.trim() ||
    entry.description.length > MAX_DESCRIPTION_LENGTH ||
    !Array.isArray(lifestyle)
  ) {
    return false;
  }

  const item = lifestyle.find((candidate) => candidate?.id === entry.categoryId);
  if (!item) return false;
  const month = entry.date.slice(0, 7);
  return (
    (item.startMonth === undefined ||
      (isMonth(item.startMonth) && item.startMonth <= month)) &&
    (item.endMonth === undefined || (isMonth(item.endMonth) && month <= item.endMonth))
  );
};

export const isValidHouse = (house) =>
  typeof house?.id === "string" &&
  isName(house.name) &&
  isMoney(house.loan) &&
  house.loan > 0 &&
  (house.price === undefined || (isMoney(house.price) && house.price >= house.loan)) &&
  Number.isFinite(house.ratePercent) &&
  house.ratePercent >= 0 &&
  house.ratePercent <= MAX_RATE_PERCENT &&
  Number.isInteger(house.termMonths) &&
  house.termMonths >= 1 &&
  house.termMonths <= MAX_TERM_MONTHS &&
  isMonth(house.startMonth) &&
  (house.installment === undefined ||
    (isMoney(house.installment) && house.installment > 0 && repaysInFull(house)));
