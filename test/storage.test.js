import { test } from "node:test";
import assert from "node:assert/strict";
import { exportBackup } from "../backup.js";
import { STORAGE_KEY } from "../storage.js";

const storageModule = await import("../storage.js");
assert.equal(typeof storageModule.createStorageClient, "function", "the remote storage client must exist");
const {
  AuthRequiredError,
  StorageConflictError,
  StorageError,
  createStorageClient,
} = storageModule;

const validState = {
  income: 0,
  commitments: [],
  lifestyle: [],
  houses: [],
  spending: [],
};
const validBackup = exportBackup(validState);

const memoryStorage = (items = new Map()) => ({
  getItem(key) {
    return items.has(key) ? items.get(key) : null;
  },
  setItem(key, value) {
    items.set(key, value);
  },
  removeItem(key) {
    items.delete(key);
  },
});

const responseJson = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

test("loadState returns validated remote data and its ETag", async () => {
  const client = createStorageClient({
    fetchImpl: async () => responseJson({ backup: validBackup }, 200, { etag: '"v1"' }),
    storage: memoryStorage(),
  });

  assert.deepEqual(await client.loadState(), {
    status: "loaded",
    state: validState,
    etag: '"v1"',
  });
});

test("loadState propagates the remote upgrade notice without changing the ETag", async () => {
  const notice = "Older check-ins were removed; other saved data was kept.";
  const client = createStorageClient({
    fetchImpl: async () =>
      responseJson({ backup: validBackup, notice }, 200, { etag: '"v1"' }),
    storage: memoryStorage(),
  });

  assert.deepEqual(await client.loadState(), {
    status: "loaded",
    state: validState,
    etag: '"v1"',
    notice,
  });
});

test("only the canonical missing-state response means the account is empty", async () => {
  const client = createStorageClient({
    fetchImpl: async () => responseJson({ error: "state_not_found" }, 404),
    storage: memoryStorage(),
  });

  assert.deepEqual(await client.loadState(), { status: "empty" });
});

test("an unrouted HTML 404 is a storage failure, not an empty account", async () => {
  const client = createStorageClient({
    fetchImpl: async () => new Response("<html>not found</html>", { status: 404 }),
    storage: memoryStorage(),
  });

  await assert.rejects(client.loadState(), StorageError);
});

test("a 401 response requires GitHub sign-in", async () => {
  const client = createStorageClient({
    fetchImpl: async () => responseJson({ error: "unauthorized" }, 401),
    storage: memoryStorage(),
  });

  await assert.rejects(client.loadState(), AuthRequiredError);
});

test("malformed successful responses and server errors remain visible", async () => {
  const malformed = createStorageClient({
    fetchImpl: async () => new Response("not JSON", { status: 200 }),
    storage: memoryStorage(),
  });
  const unavailable = createStorageClient({
    fetchImpl: async () => new Response("unavailable", { status: 503 }),
    storage: memoryStorage(),
  });

  await assert.rejects(malformed.loadState(), StorageError);
  await assert.rejects(unavailable.loadState(), StorageError);
});

test("invalid remote backup content is rejected", async () => {
  const client = createStorageClient({
    fetchImpl: async () => responseJson({ backup: "invalid" }, 200, { etag: '"v1"' }),
    storage: memoryStorage(),
  });

  await assert.rejects(client.loadState(), StorageError);
});

test("saveState sends the validated backup and propagates its ETag", async () => {
  let request;
  const client = createStorageClient({
    fetchImpl: async (url, options) => {
      request = { url, options };
      return responseJson({ ok: true }, 200, { etag: '"v2"' });
    },
    storage: memoryStorage(),
  });

  assert.equal(await client.saveState(validState, '"v1"'), '"v2"');
  assert.equal(request.url, "/api/state");
  assert.equal(request.options.method, "PUT");
  assert.equal(request.options.credentials, "same-origin");
  assert.equal(request.options.headers.accept, "application/json");
  assert.equal(request.options.headers["If-Match"], '"v1"');
  assert.deepEqual(JSON.parse(request.options.body), { backup: validBackup });
});

test("saving malformed Spending lists rejects the state instead of silently clearing entries", async () => {
  let writes = 0;
  const client = createStorageClient({
    fetchImpl: async () => {
      writes += 1;
      return responseJson({ ok: true }, 200, { etag: '"v2"' });
    },
    storage: memoryStorage(),
  });
  for (const spending of [undefined, null, "not a list", {}]) {
    await assert.rejects(client.saveState({ ...validState, spending }, '"v1"'), StorageError);
  }
  assert.equal(writes, 0);
});

test("saveState creates the first remote state conditionally when no ETag exists", async () => {
  let request;
  const client = createStorageClient({
    fetchImpl: async (url, options) => {
      request = { url, options };
      return responseJson({ ok: true }, 200, { etag: '"v1"' });
    },
    storage: memoryStorage(),
  });

  assert.equal(await client.saveState(validState, null), '"v1"');
  assert.equal(request.options.headers["If-None-Match"], "*");
});

test("migration creates state conditionally and returns its ETag", async () => {
  let request;
  const client = createStorageClient({
    fetchImpl: async (url, options) => {
      request = { url, options };
      return responseJson({ ok: true }, 200, { etag: '"v1"' });
    },
    storage: memoryStorage(),
  });

  assert.deepEqual(await client.migrateLegacyState(validBackup), {
    status: "migrated",
    state: validState,
    etag: '"v1"',
  });
  assert.equal(request.options.headers["If-None-Match"], "*");
});

test("a competing initial migration is reported as a conflict", async () => {
  const client = createStorageClient({
    fetchImpl: async () => responseJson({ error: "state_conflict" }, 409),
    storage: memoryStorage(),
  });

  await assert.rejects(client.migrateLegacyState(validBackup), StorageConflictError);
});

test("invalid legacy backup content is not offered for migration", () => {
  const client = createStorageClient({
    fetchImpl: async () => responseJson({}),
    storage: memoryStorage(new Map([[STORAGE_KEY, "invalid"]])),
  });
  const result = client.loadLegacyState();
  assert.equal(result.status, "invalid");
  assert.match(result.notice, /not a valid expense backup/i);
});

test("legacy backup upgrade notices propagate while retaining the original browser value", () => {
  const legacyBackup = JSON.stringify({
    schemaVersion: 6,
    data: {
      income: 100,
      commitments: [],
      lifestyle: [],
      checkIns: [{ month: "2026-10", itemId: "food", name: "Food", low: 1, high: 2, actual: 1 }],
      houses: [],
    },
  });
  const storage = memoryStorage(new Map([[STORAGE_KEY, legacyBackup]]));
  const client = createStorageClient({ fetchImpl: async () => responseJson({}), storage });

  const result = client.loadLegacyState();

  assert.equal(result.status, "available");
  assert.match(result.notice, /check-in/i);
  assert.equal(storage.getItem(STORAGE_KEY), legacyBackup);
});

test("blocked local storage is reported as unavailable", () => {
  const client = createStorageClient({
    fetchImpl: async () => responseJson({}),
    storage: {
      getItem() {
        throw new Error("storage blocked");
      },
    },
  });

  assert.equal(client.loadLegacyState().status, "unavailable");
});

test("legacy migration leaves the browser value untouched", async () => {
  const storage = memoryStorage(new Map([[STORAGE_KEY, validBackup]]));
  let requestCount = 0;
  const fetchImpl = async () => {
    requestCount += 1;
    return requestCount === 1
      ? responseJson({ error: "state_not_found" }, 404)
      : responseJson({ ok: true }, 200, { etag: '"v1"' });
  };
  const client = createStorageClient({ fetchImpl, storage });
  assert.deepEqual(await client.loadState(), { status: "empty" });
  const legacy = client.loadLegacyState();

  assert.equal(legacy.status, "available");
  await client.migrateLegacyState(legacy.backup);

  assert.equal(storage.getItem(STORAGE_KEY), validBackup);
});

test("a failed GET is never represented as an empty account", async () => {
  const client = createStorageClient({
    fetchImpl: async () => new Response("unavailable", { status: 503 }),
    storage: memoryStorage(),
  });

  await assert.rejects(client.loadState(), StorageError);
});
