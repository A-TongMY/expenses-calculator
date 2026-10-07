import { isMoney, isValidCommitment, isValidLifestyle } from "./rules.js";

const SCHEMA_VERSION = 3;

const COMMITMENT_FIELDS = ["id", "name", "amount", "everyMonths", "startMonth", "endMonth"];
const LIFESTYLE_FIELDS = ["id", "name", "low", "high", "everyMonths", "startMonth", "endMonth"];

const pick = (item, fields) =>
  Object.fromEntries(fields.filter((field) => item[field] !== undefined).map((field) => [field, item[field]]));

const isValidList = (items, isValid) =>
  Array.isArray(items) &&
  items.every(isValid) &&
  new Set(items.map((item) => item.id)).size === items.length;

function isState(data, version) {
  return (
    isMoney(data?.income) &&
    isValidList(data?.commitments, isValidCommitment) &&
    (version === 1 || isValidList(data?.lifestyle, isValidLifestyle))
  );
}

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
  if (!Number.isInteger(version) || version < 1 || !isState(parsed?.data, version)) {
    throw new Error(
      "This file is not a valid backup: the data is not in the expected shape.",
    );
  }
  const { income, commitments } = parsed.data;
  const lifestyle = version === 1 ? [] : parsed.data.lifestyle;
  return {
    income,
    commitments: commitments.map((item) => pick(item, COMMITMENT_FIELDS)),
    lifestyle: lifestyle.map((item) => pick(item, LIFESTYLE_FIELDS)),
  };
}
