import {
  MAX_HOUSES,
  MAX_ITEMS,
  isMoney,
  isValidCheckIn,
  isValidCommitment,
  isValidHouse,
  isValidLifestyle,
} from "./rules.js";

const SCHEMA_VERSION = 6;
const LIFESTYLE_SINCE = 2;
const CHECK_INS_SINCE = 5;
const HOUSES_SINCE = 6;

const COMMITMENT_FIELDS = ["id", "name", "amount", "everyMonths", "startMonth", "endMonth", "scenario"];
const LIFESTYLE_FIELDS = ["id", "name", "low", "high", "everyMonths", "startMonth", "endMonth"];
const CHECK_IN_FIELDS = ["month", "itemId", "name", "low", "high", "actual"];
const HOUSE_FIELDS = ["id", "name", "price", "loan", "ratePercent", "termMonths", "startMonth", "installment"];

const pick = (item, fields) =>
  Object.fromEntries(fields.filter((field) => item[field] !== undefined).map((field) => [field, item[field]]));

const toCommitment = (item) => {
  const commitment = pick(item, COMMITMENT_FIELDS);
  return commitment.scenario ? { ...commitment, scenario: { on: commitment.scenario.on } } : commitment;
};

const isValidList = (items, isValid, keyOf = (item) => item.id, limit = MAX_ITEMS) =>
  Array.isArray(items) &&
  items.length <= limit &&
  items.every(isValid) &&
  new Set(items.map(keyOf)).size === items.length;

const checkInKey = ({ month, itemId }) => `${month}|${itemId}`;

// Older backups predate some lists: those start empty, and a stray value for them is ignored.
const upgrade = (data, version) => ({
  ...data,
  lifestyle: version < LIFESTYLE_SINCE ? [] : data?.lifestyle,
  checkIns: version < CHECK_INS_SINCE ? [] : data?.checkIns,
  houses: version < HOUSES_SINCE ? [] : data?.houses,
});

const isState = (data) =>
  isMoney(data.income) &&
  isValidList(data.commitments, isValidCommitment) &&
  isValidList(data.lifestyle, isValidLifestyle) &&
  isValidList(data.checkIns, isValidCheckIn, checkInKey) &&
  isValidList(data.houses, isValidHouse, undefined, MAX_HOUSES);

export function exportBackup(state) {
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, data: state }, null, 2);
}

export function importBackup(file) {
  let parsed;
  try {
    parsed = JSON.parse(file);
  } catch {
    throw new Error("This file is not a valid backup: it is not JSON.");
  }
  const version = parsed?.schemaVersion;
  if (Number.isInteger(version) && version > SCHEMA_VERSION) {
    throw new Error(
      "This backup was made by a newer version of the app and cannot be imported.",
    );
  }
  const data = upgrade(parsed?.data, version);
  if (!Number.isInteger(version) || version < 1 || !isState(data)) {
    throw new Error(
      "This file is not a valid backup: the data is not in the expected shape.",
    );
  }
  return {
    income: data.income,
    commitments: data.commitments.map(toCommitment),
    lifestyle: data.lifestyle.map((item) => pick(item, LIFESTYLE_FIELDS)),
    checkIns: data.checkIns.map((item) => pick(item, CHECK_IN_FIELDS)),
    houses: data.houses.map((item) => pick(item, HOUSE_FIELDS)),
  };
}
