import { test } from "node:test";
import assert from "node:assert/strict";
import { exportBackup, importBackup } from "../backup.js";

const sampleState = {
  income: 5000,
  commitments: [
    { id: "c1", name: "Rent", amount: 1500, everyMonths: 1 },
    { id: "c2", name: "Car insurance", amount: 1200, everyMonths: 12, endMonth: "2028-06" },
    { id: "c3", name: "New car", amount: 900, everyMonths: 1, scenario: { on: true } },
    { id: "c4", name: "Bigger flat", amount: 2200, everyMonths: 1, startMonth: "2027-06", scenario: { on: false } },
  ],
  lifestyle: [
    { id: "l1", name: "Food", low: 400, high: 600, everyMonths: 1 },
    { id: "l2", name: "Salon", low: 120, high: 210, everyMonths: 3, startMonth: "2027-01" },
  ],
  checkIns: [
    { month: "2026-09", itemId: "l1", name: "Food", low: 400, high: 600, actual: 520.5 },
    { month: "2026-10", itemId: "l1", name: "Food", low: 400, high: 600, actual: 480 },
  ],
};

const rent = { id: "c1", name: "Rent", amount: 100, everyMonths: 1 };
const food = { id: "l1", name: "Food", low: 400, high: 600, everyMonths: 1 };

const checkIn = { month: "2026-10", itemId: "l1", name: "Food", low: 400, high: 600, actual: 480 };

const many = (count, make) => Array.from({ length: count }, (_, index) => make(index));

const stateWith = (overrides) => ({
  income: 5000,
  commitments: [rent],
  lifestyle: [food],
  checkIns: [],
  ...overrides,
});

const backupOf = (data, schemaVersion = 5) => JSON.stringify({ schemaVersion, data });

test("a backup can be imported back into exactly the state that was exported", () => {
  const file = exportBackup(sampleState);
  assert.deepEqual(importBackup(file), sampleState);
});

test("exporting writes the current schema version", () => {
  assert.equal(JSON.parse(exportBackup(sampleState)).schemaVersion, 5);
});

test("a version 1 backup, from before lifestyle spending existed, still imports", () => {
  const file = JSON.stringify({
    schemaVersion: 1,
    data: { income: 5000, commitments: [rent] },
  });
  assert.deepEqual(importBackup(file), { income: 5000, commitments: [rent], lifestyle: [], checkIns: [] });
});

test("importing something that is not JSON is rejected with a clear message", () => {
  assert.throws(() => importBackup("not a backup {"), {
    message: "This file is not a valid backup: it is not JSON.",
  });
});

test("a backup from a newer version of the app is refused", () => {
  assert.throws(() => importBackup(backupOf(sampleState, 6)), {
    message: "This backup was made by a newer version of the app and cannot be imported.",
  });
});

const notBackups = {
  "an empty object": "{}",
  "no data": JSON.stringify({ schemaVersion: 5 }),
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
  "a start month that is not a real month": backupOf(stateWith({ commitments: [{ ...rent, startMonth: "2026-13" }] })),
  "a start month without the leading zero": backupOf(stateWith({ commitments: [{ ...rent, startMonth: "2026-1" }] })),
  "an end month that is a number": backupOf(stateWith({ commitments: [{ ...rent, endMonth: 202612 }] })),
  "an end month that is null": backupOf(stateWith({ commitments: [{ ...rent, endMonth: null }] })),
  "a commitment ending before it starts": backupOf(stateWith({ commitments: [{ ...rent, startMonth: "2027-03", endMonth: "2027-02" }] })),
  "a lifestyle start month that is not a real month": backupOf(stateWith({ lifestyle: [{ ...food, startMonth: "2026-00" }] })),
  "a lifestyle item ending before it starts": backupOf(stateWith({ lifestyle: [{ ...food, startMonth: "2027-03", endMonth: "2027-02" }] })),
  "a scenario flag that is just true": backupOf(stateWith({ commitments: [{ ...rent, scenario: true }] })),
  "a scenario whose on is not a boolean": backupOf(stateWith({ commitments: [{ ...rent, scenario: { on: "yes" } }] })),
  "a scenario with no on": backupOf(stateWith({ commitments: [{ ...rent, scenario: {} }] })),
  "a scenario that is null": backupOf(stateWith({ commitments: [{ ...rent, scenario: null }] })),
  "no check-in list": backupOf({ income: 5000, commitments: [rent], lifestyle: [food] }),
  "a check-in list that is not a list": backupOf(stateWith({ checkIns: "none" })),
  "a check-in with a bad month": backupOf(stateWith({ checkIns: [{ ...checkIn, month: "2026-13" }] })),
  "a check-in month without the leading zero": backupOf(stateWith({ checkIns: [{ ...checkIn, month: "2026-9" }] })),
  "a negative actual": backupOf(stateWith({ checkIns: [{ ...checkIn, actual: -1 }] })),
  "an actual above the limit": backupOf(stateWith({ checkIns: [{ ...checkIn, actual: 1_000_000_001 }] })),
  "a check-in estimate with low above high": backupOf(stateWith({ checkIns: [{ ...checkIn, low: 700 }] })),
  "a blank check-in name": backupOf(stateWith({ checkIns: [{ ...checkIn, name: " " }] })),
  "a check-in with no item": backupOf(stateWith({ checkIns: [{ ...checkIn, itemId: undefined }] })),
  "two check-ins for the same item and month": backupOf(stateWith({ checkIns: [checkIn, { ...checkIn, actual: 500 }] })),
  "a start year before 1900": backupOf(stateWith({ commitments: [{ ...rent, startMonth: "0050-01" }] })),
  "more than 2000 commitments": backupOf(stateWith({ commitments: many(2001, (i) => ({ ...rent, id: `c${i}` })) })),
  "more than 2000 lifestyle items": backupOf(stateWith({ lifestyle: many(2001, (i) => ({ ...food, id: `l${i}` })) })),
  "more than 2000 check-ins": backupOf(stateWith({ checkIns: many(2001, (i) => ({ ...checkIn, itemId: `l${i}` })) })),
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
    checkIns: [],
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
    assert.deepEqual(importBackup(file), { income: 5000, commitments: [rent], lifestyle: [], checkIns: [] });
  });
}

test("a version 2 backup, from before start and end months existed, still imports", () => {
  const data = { income: 5000, commitments: [rent], lifestyle: [food] };
  assert.deepEqual(importBackup(backupOf(data, 2)), { ...data, checkIns: [] });
});

test("an expense that starts and ends in the same month is accepted", () => {
  const state = stateWith({ commitments: [{ ...rent, startMonth: "2027-03", endMonth: "2027-03" }] });
  assert.deepEqual(importBackup(backupOf(state)), state);
});

test("a version 3 backup, from before scenarios existed, still imports", () => {
  const data = { income: 5000, commitments: [rent], lifestyle: [food] };
  assert.deepEqual(importBackup(backupOf(data, 3)), { ...data, checkIns: [] });
});

test("unknown fields inside a scenario are dropped", () => {
  const file = backupOf(
    stateWith({ commitments: [{ ...rent, scenario: { on: false, note: "keep out" } }] }),
  );
  assert.deepEqual(
    importBackup(file),
    stateWith({ commitments: [{ ...rent, scenario: { on: false } }] }),
  );
});

test("a scenario flag on a lifestyle item is dropped, because only commitments can be scenarios", () => {
  const file = backupOf(stateWith({ lifestyle: [{ ...food, scenario: { on: true } }] }));
  assert.deepEqual(importBackup(file), stateWith({}));
});

test("a version 4 backup, from before check-ins existed, still imports", () => {
  const data = { income: 5000, commitments: [rent], lifestyle: [food] };
  assert.deepEqual(importBackup(backupOf(data, 4)), { ...data, checkIns: [] });
});

test("the same item can be checked in for different months, and different items in the same month", () => {
  const state = stateWith({
    checkIns: [
      checkIn,
      { ...checkIn, month: "2026-09" },
      { ...checkIn, itemId: "l2", name: "Salon" },
    ],
  });
  assert.deepEqual(importBackup(backupOf(state)), state);
});

test("unknown fields inside a check-in are dropped", () => {
  const file = backupOf(stateWith({ checkIns: [{ ...checkIn, note: "keep out" }] }));
  assert.deepEqual(importBackup(file), stateWith({ checkIns: [checkIn] }));
});

test("a stray check-in list on a version 4 backup is ignored", () => {
  const data = { income: 5000, commitments: [rent], lifestyle: [food], checkIns: "garbage" };
  assert.deepEqual(importBackup(backupOf(data, 4)), stateWith({}));
});

test("exactly 2000 items in a list is still accepted", () => {
  const state = stateWith({ commitments: many(2000, (i) => ({ ...rent, id: `c${i}` })) });
  assert.equal(importBackup(backupOf(state)).commitments.length, 2000);
});
