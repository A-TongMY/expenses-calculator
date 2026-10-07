const SCHEMA_VERSION = 1;

const isMoney = (value) => Number.isFinite(value) && value >= 0;

function isCommitment(c) {
  return (
    typeof c?.id === "string" &&
    typeof c?.name === "string" &&
    isMoney(c?.amount) &&
    Number.isInteger(c?.everyMonths) &&
    c.everyMonths >= 1
  );
}

function isState(data) {
  return (
    isMoney(data?.income) &&
    Array.isArray(data?.commitments) &&
    data.commitments.every(isCommitment)
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
  if (parsed?.schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      "This backup was made by a newer version of the app and cannot be imported.",
    );
  }
  if (!isState(parsed?.data)) {
    throw new Error(
      "This file is not a valid backup: the data is not in the expected shape.",
    );
  }
  return parsed.data;
}
