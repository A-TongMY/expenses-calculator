import { test } from "node:test";
import assert from "node:assert/strict";
import { exportBackup, importBackup } from "../backup.js";

const sampleState = {
  income: 5000,
  commitments: [
    { id: "c1", name: "Rent", amount: 1500, everyMonths: 1 },
    { id: "c2", name: "Car insurance", amount: 1200, everyMonths: 12 },
  ],
  lifestyle: [
    { id: "l1", name: "Food", low: 400, high: 600, everyMonths: 1 },
    { id: "l2", name: "Salon", low: 120, high: 210, everyMonths: 3 },
  ],
};

const rent = { id: "c1", name: "Rent", amount: 100, everyMonths: 1 };
const food = { id: "l1", name: "Food", low: 400, high: 600, everyMonths: 1 };

const stateWith = (overrides) => ({
  income: 5000,
  commitments: [rent],
  lifestyle: [food],
  ...overrides,
});

const backupOf = (data, schemaVersion = 2) => JSON.stringify({ schemaVersion, data });

test("a backup can be imported back into exactly the state that was exported", () => {
  const file = exportBackup(sampleState);
  assert.deepEqual(importBackup(file), sampleState);
});

test("exporting writes the current schema version", () => {
  assert.equal(JSON.parse(exportBackup(sampleState)).schemaVersion, 2);
});

test("a version 1 backup, from before lifestyle spending existed, still imports", () => {
  const file = JSON.stringify({
    schemaVersion: 1,
    data: { income: 5000, commitments: [rent] },
  });
  assert.deepEqual(importBackup(file), { income: 5000, commitments: [rent], lifestyle: [] });
});

test("importing something that is not JSON is rejected with a clear message", () => {
  assert.throws(() => importBackup("not a backup {"), {
    message: "This file is not a valid backup: it is not JSON.",
  });
});

test("a backup from a newer version of the app is refused", () => {
  assert.throws(() => importBackup(backupOf(sampleState, 3)), {
    message: "This backup was made by a newer version of the app and cannot be imported.",
  });
});

const notBackups = {
  "an empty object": "{}",
  "no data": JSON.stringify({ schemaVersion: 2 }),
  "no schemaVersion": JSON.stringify({ data: sampleState }),
  "a schemaVersion that is not a number": backupOf(sampleState, "abc"),
  "a schemaVersion of zero": backupOf(sampleState, 0),
  "income that is not a number": backupOf(stateWith({ income: "lots" })),
  "an income above the limit": backupOf(stateWith({ income: 1_000_000_001 })),
  "commitments that are not a list": backupOf(stateWith({ commitments: "none" })),
  "a negative amount": backupOf(stateWith({ commitments: [{ ...rent, amount: -5 }] })),
  "an amount above the limit": backupOf(stateWith({ commitments: [{ ...rent, amount: 1_000_000_001 }] })),
  "duplicate commitment ids": backupOf(stateWith({ commitments: [rent, { ...rent, name: "Other" }] })),
  "a blank commitment name": backupOf(stateWith({ commitments: [{ ...rent, name: "   " }] })),
  "a commitment name that is too long": backupOf(stateWith({ commitments: [{ ...rent, name: "x".repeat(81) }] })),
  "a commitment cadence beyond 120 months": backupOf(stateWith({ commitments: [{ ...rent, everyMonths: 121 }] })),
  "a commitment cadence of zero months": backupOf(stateWith({ commitments: [{ ...rent, everyMonths: 0 }] })),
  "no lifestyle list": backupOf({ income: 5000, commitments: [rent] }),
  "a lifestyle list that is not a list": backupOf(stateWith({ lifestyle: "none" })),
  "a lifestyle low above its high": backupOf(stateWith({ lifestyle: [{ ...food, low: 700, high: 600 }] })),
  "a negative lifestyle low": backupOf(stateWith({ lifestyle: [{ ...food, low: -1 }] })),
  "a lifestyle high above the limit": backupOf(stateWith({ lifestyle: [{ ...food, high: 1_000_000_001 }] })),
  "duplicate lifestyle ids": backupOf(stateWith({ lifestyle: [food, { ...food, name: "Fuel" }] })),
  "a blank lifestyle name": backupOf(stateWith({ lifestyle: [{ ...food, name: "" }] })),
  "a lifestyle cadence of zero months": backupOf(stateWith({ lifestyle: [{ ...food, everyMonths: 0 }] })),
};

for (const [label, file] of Object.entries(notBackups)) {
  test(`a file that is valid JSON but has ${label} is rejected`, () => {
    assert.throws(() => importBackup(file), {
      message: "This file is not a valid backup: the data is not in the expected shape.",
    });
  });
}

test("a lifestyle range with equal low and high is accepted", () => {
  const state = stateWith({ lifestyle: [{ ...food, low: 500, high: 500 }] });
  assert.deepEqual(importBackup(backupOf(state)), state);
});

test("fields the app does not know about are dropped on import", () => {
  const file = backupOf({
    income: 5000,
    secretNote: "keep out",
    commitments: [{ ...rent, notes: "keep out too" }],
    lifestyle: [{ ...food, notes: "keep out as well" }],
  });
  assert.deepEqual(importBackup(file), stateWith({}));
});

const strayLifestyles = {
  "a lifestyle value that is not a list": 5,
  "a lifestyle list holding a null": [null],
  "a lifestyle item that breaks every rule": [{ id: "x", name: "", low: 9, high: 1, everyMonths: 0 }],
};

for (const [label, lifestyle] of Object.entries(strayLifestyles)) {
  test(`a version 1 backup carrying ${label} ignores it and imports with no lifestyle`, () => {
    const file = JSON.stringify({
      schemaVersion: 1,
      data: { income: 5000, commitments: [rent], lifestyle },
    });
    assert.deepEqual(importBackup(file), { income: 5000, commitments: [rent], lifestyle: [] });
  });
}
