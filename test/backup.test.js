import { test } from "node:test";
import assert from "node:assert/strict";
import { exportBackup, importBackup } from "../backup.js";

const sampleState = {
  income: 5000,
  commitments: [
    { id: "c1", name: "Rent", amount: 1500, everyMonths: 1 },
    { id: "c2", name: "Car insurance", amount: 1200, everyMonths: 12 },
  ],
};

const backupOf = (data, schemaVersion = 1) => JSON.stringify({ schemaVersion, data });

const rent = { id: "c1", name: "Rent", amount: 100, everyMonths: 1 };

test("a backup can be imported back into exactly the state that was exported", () => {
  const file = exportBackup(sampleState);
  assert.deepEqual(importBackup(file), sampleState);
});

test("importing something that is not JSON is rejected with a clear message", () => {
  assert.throws(() => importBackup("not a backup {"), {
    message: "This file is not a valid backup: it is not JSON.",
  });
});

test("a backup from a newer version of the app is refused", () => {
  assert.throws(() => importBackup(backupOf(sampleState, 2)), {
    message: "This backup was made by a newer version of the app and cannot be imported.",
  });
});

const notBackups = {
  "an empty object": "{}",
  "no data": JSON.stringify({ schemaVersion: 1 }),
  "income that is not a number": backupOf({ income: "lots", commitments: [] }),
  "commitments that are not a list": backupOf({ income: 5000, commitments: "none" }),
  "a negative amount": backupOf({ income: 5000, commitments: [{ ...rent, amount: -5 }] }),
  "no schemaVersion": JSON.stringify({ data: sampleState }),
  "a schemaVersion that is not a number": backupOf(sampleState, "abc"),
  "a schemaVersion of zero": backupOf(sampleState, 0),
  "duplicate ids": backupOf({ income: 5000, commitments: [rent, { ...rent, name: "Other" }] }),
  "a blank name": backupOf({ income: 5000, commitments: [{ ...rent, name: "   " }] }),
  "a name that is too long": backupOf({ income: 5000, commitments: [{ ...rent, name: "x".repeat(81) }] }),
  "an amount above the limit": backupOf({ income: 5000, commitments: [{ ...rent, amount: 1_000_000_001 }] }),
  "an income above the limit": backupOf({ income: 1_000_000_001, commitments: [] }),
  "a cadence beyond 120 months": backupOf({ income: 5000, commitments: [{ ...rent, everyMonths: 121 }] }),
  "a cadence of zero months": backupOf({ income: 5000, commitments: [{ ...rent, everyMonths: 0 }] }),
};

for (const [label, file] of Object.entries(notBackups)) {
  test(`a file that is valid JSON but has ${label} is rejected`, () => {
    assert.throws(() => importBackup(file), {
      message: "This file is not a valid backup: the data is not in the expected shape.",
    });
  });
}

test("fields the app does not know about are dropped on import", () => {
  const file = backupOf({
    income: 5000,
    secretNote: "keep out",
    commitments: [{ ...rent, notes: "keep out too" }],
  });
  assert.deepEqual(importBackup(file), { income: 5000, commitments: [rent] });
});
