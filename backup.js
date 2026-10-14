import {
  MAX_HOUSES,
  MAX_ITEMS,
  isMoney,
  isValidCheckIn,
  isValidCommitment,
  isValidHouse,
  isValidLifestyle,
  isValidSpending,
} from "./rules.js";

const SCHEMA_VERSION = 7;
const LIFESTYLE_SINCE = 2;
const CHECK_INS_SINCE = 5;
const HOUSES_SINCE = 6;
const SPENDING_FIELDS = ["id", "date", "categoryId", "amount", "description"];

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

const toLifestyle = (item) => pick(item, LIFESTYLE_FIELDS);
const toHouse = (item) => pick(item, HOUSE_FIELDS);
const toSpending = (item) => pick(item, SPENDING_FIELDS);

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
  checkIns: version < CHECK_INS_SINCE || version >= SCHEMA_VERSION ? [] : data?.checkIns,
  houses: version < HOUSES_SINCE ? [] : data?.houses,
  spending: version < SCHEMA_VERSION ? [] : data?.spending,
});

const isLegacyState = (data) =>
  isMoney(data.income) &&
  isValidList(data.commitments, isValidCommitment) &&
  isValidList(data.lifestyle, isValidLifestyle) &&
  isValidList(data.checkIns, isValidCheckIn, checkInKey) &&
  isValidList(data.houses, isValidHouse, undefined, MAX_HOUSES);

const isCurrentState = (data) =>
  isMoney(data.income) &&
  isValidList(data.commitments, isValidCommitment) &&
  isValidList(data.lifestyle, isValidLifestyle) &&
  isValidList(data.houses, isValidHouse, undefined, MAX_HOUSES) &&
  isValidList(
    data.spending,
    (entry) => isValidSpending(entry, data.lifestyle),
    undefined,
    MAX_ITEMS,
  );

const toCurrentState = (data) => ({
  income: data.income,
  commitments: data.commitments.map(toCommitment),
  lifestyle: data.lifestyle.map(toLifestyle),
  houses: data.houses.map(toHouse),
  spending: data.spending.map(toSpending),
});

const toLegacyState = (data) => ({
  income: data.income,
  commitments: data.commitments.map(toCommitment),
  lifestyle: data.lifestyle.map(toLifestyle),
  houses: data.houses.map(toHouse),
  spending: [],
});

export function exportBackup(state) {
  return JSON.stringify(
    {
      schemaVersion: SCHEMA_VERSION,
      data: {
        income: state.income,
        commitments: Array.isArray(state.commitments) ? state.commitments.map(toCommitment) : [],
        lifestyle: Array.isArray(state.lifestyle) ? state.lifestyle.map(toLifestyle) : [],
        houses: Array.isArray(state.houses) ? state.houses.map(toHouse) : [],
        spending: Array.isArray(state.spending) ? state.spending.map(toSpending) : [],
      },
    },
    null,
    2,
  );
}

export function readBackup(file) {
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
  if (!Number.isInteger(version) || version < 1 || !isLegacyState(data)) {
    throw new Error(
      "This file is not a valid backup: the data is not in the expected shape.",
    );
  }
  if (version < SCHEMA_VERSION) {
    const notice =
      Array.isArray(data.checkIns) && data.checkIns.length > 0
        ? "Older check-ins were removed from the remote copy."
        : null;
    return { state: toLegacyState(data), notice };
  }
  if (!isCurrentState(data)) {
    throw new Error(
      "This file is not a valid backup: the data is not in the expected shape.",
    );
  }
  return { state: toCurrentState(data), notice: null };
}

export function importBackup(file) {
  return readBackup(file).state;
}
