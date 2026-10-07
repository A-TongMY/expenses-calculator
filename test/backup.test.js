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
  const file = JSON.stringify({ schemaVersion: 2, data: sampleState });
  assert.throws(() => importBackup(file), {
    message: "This backup was made by a newer version of the app and cannot be imported.",
  });
});

test("a file that is valid JSON but not a backup of this app is rejected", () => {
  const notBackups = [
    {},
    { schemaVersion: 1 },
    { schemaVersion: 1, data: { income: "lots", commitments: [] } },
    { schemaVersion: 1, data: { income: 5000, commitments: "none" } },
    {
      schemaVersion: 1,
      data: {
        income: 5000,
        commitments: [{ id: "c1", name: "Rent", amount: -5, everyMonths: 1 }],
      },
    },
    {
      schemaVersion: 1,
      data: {
        income: 5000,
        commitments: [{ id: "c1", name: "Rent", amount: 100, everyMonths: 0 }],
      },
    },
  ];
  for (const notBackup of notBackups) {
    assert.throws(() => importBackup(JSON.stringify(notBackup)), {
      message: "This file is not a valid backup: the data is not in the expected shape.",
    });
  }
});
