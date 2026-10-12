import { repaysInFull } from "./loan.js";

export const MAX_AMOUNT = 1_000_000_000;
export const MAX_EVERY_MONTHS = 120;
export const MAX_NAME_LENGTH = 80;
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
