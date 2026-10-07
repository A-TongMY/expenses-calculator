import { isMoney, isValidCommitment } from "./rules.js";

const SCHEMA_VERSION = 1;

function isState(data) {
  return (
    isMoney(data?.income) &&
    Array.isArray(data?.commitments) &&
    data.commitments.every(isValidCommitment) &&
    new Set(data.commitments.map((c) => c.id)).size === data.commitments.length
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
  if (version !== SCHEMA_VERSION || !isState(parsed?.data)) {
    throw new Error(
      "This file is not a valid backup: the data is not in the expected shape.",
    );
  }
  const { income, commitments } = parsed.data;
  return {
    income,
    commitments: commitments.map(({ id, name, amount, everyMonths }) => ({
      id,
      name,
      amount,
      everyMonths,
    })),
  };
}
