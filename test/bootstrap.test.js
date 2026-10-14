import { test } from "node:test";
import assert from "node:assert/strict";
import { StorageConflictError, StorageError } from "../storage.js";

const bootstrapModule = await import("../bootstrap.js").catch(() => null);
assert.ok(bootstrapModule, "the startup state initializer must exist");
const { initializeState } = bootstrapModule;

const remoteState = {
  income: 5000,
  commitments: [{ id: "rent", name: "Rent", amount: 1000, everyMonths: 1 }],
  lifestyle: [],
  houses: [],
  spending: [],
};
const legacyState = {
  income: 3000,
  commitments: [],
  lifestyle: [],
  houses: [],
  spending: [],
};
const legacy = { status: "available", backup: "valid legacy backup", state: legacyState };
const blankState = { income: 0, commitments: [], lifestyle: [], houses: [], spending: [] };

test("loaded remote data bypasses legacy browser storage", async () => {
  const storage = {
    loadState: async () => ({ status: "loaded", state: remoteState, etag: '"v1"' }),
    loadLegacyState() {
      throw new Error("legacy storage must not be inspected");
    },
  };

  const result = await initializeState({ storage, confirmMigration: async () => true });

  assert.deepEqual(result.state, remoteState);
  assert.equal(result.etag, '"v1"');
  assert.equal(result.migrated, false);
});

test("loaded remote upgrade notices reach startup unchanged", async () => {
  const notice = "Older check-ins were removed; other saved data was kept.";
  const storage = {
    loadState: async () => ({ status: "loaded", state: remoteState, etag: '"v1"', notice }),
    loadLegacyState() {
      throw new Error("legacy storage must not be inspected");
    },
  };

  const result = await initializeState({ storage });

  assert.equal(result.notice, notice);
  assert.equal(result.etag, '"v1"');
});

test("a remote read error is not converted into a blank state", async () => {
  const storage = {
    loadState: async () => {
      throw new StorageError("unavailable");
    },
    loadLegacyState: () => {
      throw new Error("must not inspect local data");
    },
  };

  await assert.rejects(
    initializeState({ storage, confirmMigration: () => true }),
    StorageError,
  );
});

test("malformed storage results do not become a blank or loaded state", async () => {
  const invalidRemote = {
    loadState: async () => ({ status: "loaded", state: remoteState, etag: null }),
    loadLegacyState: () => legacy,
  };
  const invalidLegacy = {
    loadState: async () => ({ status: "empty" }),
    loadLegacyState: () => ({ status: "unexpected" }),
  };

  await assert.rejects(
    initializeState({ storage: invalidRemote }),
    StorageError,
  );
  await assert.rejects(
    initializeState({ storage: invalidLegacy }),
    StorageError,
  );
});

test("accepted migration initializes the remote state without deleting the legacy copy", async () => {
  let confirmedLegacy;
  const storage = {
    loadState: async () => ({ status: "empty" }),
    loadLegacyState: () => legacy,
    async migrateLegacyState(backup) {
      assert.equal(backup, legacy.backup);
      return { status: "migrated", state: legacyState, etag: '"v2"' };
    },
  };

  const result = await initializeState({
    storage,
    confirmMigration: async (value) => {
      confirmedLegacy = value;
      return true;
    },
  });

  assert.deepEqual(confirmedLegacy, legacy);
  assert.deepEqual(result.state, legacyState);
  assert.equal(result.etag, '"v2"');
  assert.equal(result.migrated, true);
});

test("accepted migration propagates the legacy reader notice", async () => {
  const notice = "Older check-ins were removed; other saved data was kept.";
  const storage = {
    loadState: async () => ({ status: "empty" }),
    loadLegacyState: () => ({ ...legacy, notice }),
    async migrateLegacyState() {
      return { status: "migrated", state: legacyState, etag: '"v2"' };
    },
  };

  const result = await initializeState({ storage, confirmMigration: async () => true });

  assert.equal(result.notice, notice);
});
test("declined migration leaves the remote state empty and local data available", async () => {
  let migrationCalls = 0;
  const storage = {
    loadState: async () => ({ status: "empty" }),
    loadLegacyState: () => legacy,
    async migrateLegacyState() {
      migrationCalls += 1;
    },
  };

  const result = await initializeState({ storage, confirmMigration: async () => false });

  assert.deepEqual(result.state, blankState);
  assert.equal(result.etag, null);
  assert.equal(result.migrated, false);
  assert.equal(migrationCalls, 0);
});

test("invalid or unavailable legacy storage returns a notice without migration", async () => {
  for (const status of ["invalid", "unavailable"]) {
    let migrationCalls = 0;
    const storage = {
      loadState: async () => ({ status: "empty" }),
      loadLegacyState: () => ({ status, notice: `${status} legacy data` }),
      async migrateLegacyState() {
        migrationCalls += 1;
      },
    };

    const result = await initializeState({ storage, confirmMigration: () => true });

    assert.deepEqual(result.state, blankState);
    assert.equal(result.migrated, false);
    assert.equal(result.notice, `${status} legacy data`);
    assert.equal(migrationCalls, 0);
  }
});

test("a competing migration returns the state created by the other device", async () => {
  const legacyNotice = "Older check-ins were removed from the browser copy.";
  const remoteNotice = "Older check-ins were removed from the remote copy.";
  let reads = 0;
  const storage = {
    async loadState() {
      reads += 1;
      return reads === 1
        ? { status: "empty" }
        : { status: "loaded", state: remoteState, etag: '"v9"', notice: remoteNotice };
    },
    loadLegacyState: () => ({ ...legacy, notice: legacyNotice }),
    async migrateLegacyState() {
      throw new StorageConflictError();
    },
  };

  const result = await initializeState({ storage, confirmMigration: () => true });

  assert.deepEqual(result.state, remoteState);
  assert.equal(result.etag, '"v9"');
  assert.equal(result.migrated, false);
  assert.match(result.notice, /Another device/);
  assert.match(result.notice, /Older check-ins were removed from the remote copy/);
  assert.match(result.notice, /Older check-ins were removed from the browser copy/);
  assert.equal(reads, 2);
});
