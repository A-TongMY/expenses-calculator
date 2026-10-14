import { test } from "node:test";
import assert from "node:assert/strict";
import { exportBackup } from "../backup.js";
import { createSessionCookie } from "../netlify/functions/_shared/auth.js";

const stateModule = await import("../netlify/functions/state.js").catch(() => null);
assert.ok(stateModule, "the authenticated state handler must exist");
const storeModule = await import("../netlify/functions/_shared/blob-state-store.js").catch(
  () => null,
);
assert.ok(storeModule, "the Blobs state adapter must exist");

const { createStateHandler } = stateModule;
const { createBlobStateStore, StateConflictError } = storeModule;
const allowedUser = async () => 45504842;
const expectedOrigin = "https://expenses.example";
const validBackup = exportBackup({
  income: 0,
  commitments: [],
  lifestyle: [],
  houses: [],
  spending: [],
});

const legacyV6Backup = JSON.stringify({
  schemaVersion: 6,
  data: {
    income: 5000,
    commitments: [],
    lifestyle: [{ id: "food", name: "Food", low: 400, high: 600, everyMonths: 1 }],
    checkIns: [{ month: "2026-10", itemId: "food", name: "Food", low: 400, high: 600, actual: 480 }],
    houses: [],
  },
});

function fakeStore({ backup = null, etag = '"v1"', conflict = false } = {}) {
  let currentBackup = backup;
  let currentEtag = backup === null ? null : etag;
  const writeCalls = [];
  return {
    writeCalls,
    get currentBackup() {
      return currentBackup;
    },
    get currentEtag() {
      return currentEtag;
    },
    async read() {
      return currentBackup === null
        ? null
        : { backup: currentBackup, etag: currentEtag };
    },
    async write(nextBackup, conditions) {
      writeCalls.push({ backup: nextBackup, conditions });
      if (
        conflict ||
        (conditions.onlyIfNew && currentBackup !== null) ||
        (conditions.etag && conditions.etag !== currentEtag)
      ) {
        throw new StateConflictError();
      }
      currentBackup = nextBackup;
      currentEtag = '"v2"';
      return { etag: currentEtag };
    },
  };
}

const getStateRequest = () => new Request(`${expectedOrigin}/api/state`);
const putRequest = (
  backup,
  { ifMatch, ifNoneMatch = false, origin = expectedOrigin, contentType = "application/json" } = {},
) => {
  const headers = { "content-type": contentType };
  if (origin) headers.origin = origin;
  if (ifMatch) headers["if-match"] = ifMatch;
  if (ifNoneMatch) headers["if-none-match"] = "*";
  return new Request(`${expectedOrigin}/api/state`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ backup }),
  });
};

test("state requests require an authenticated allowed account", async () => {
  const handler = createStateHandler({
    authenticate: async () => null,
    store: fakeStore(),
    expectedOrigin,
  });

  const response = await handler(getStateRequest());

  assert.equal(response.status, 401);
});

test("the default authenticator accepts only the configured GitHub ID", async () => {
  const env = {
    SESSION_SECRET: "state-test-session-secret-with-at-least-32-bytes",
    GITHUB_ALLOWED_USER_ID: "45504842",
  };
  const authenticate = stateModule.createStateAuthenticator(env);
  const allowed = createSessionCookie("45504842", env.SESSION_SECRET, Date.now());
  const other = createSessionCookie("1", env.SESSION_SECRET, Date.now());

  assert.equal(
    await authenticate(
      new Request(`${expectedOrigin}/api/state`, {
        headers: { cookie: `app_session=${allowed}` },
      }),
    ),
    45504842,
  );
  assert.equal(
    await authenticate(
      new Request(`${expectedOrigin}/api/state`, {
        headers: { cookie: `app_session=${other}` },
      }),
    ),
    null,
  );
});

test("state writes require an exact same-origin Origin header", async () => {
  const store = fakeStore();
  const handler = createStateHandler({ authenticate: allowedUser, store, expectedOrigin });
  const response = await handler(
    putRequest(validBackup, { ifNoneMatch: true, origin: "https://attacker.example" }),
  );

  assert.equal(response.status, 403);
  assert.equal(store.writeCalls.length, 0);
});

test("only GET and PUT are supported", async () => {
  const handler = createStateHandler({
    authenticate: allowedUser,
    store: fakeStore(),
    expectedOrigin,
  });
  const response = await handler(
    new Request(`${expectedOrigin}/api/state`, { method: "DELETE" }),
  );

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, PUT");
});

test("GET returns a validated stored backup and its ETag", async () => {
  const handler = createStateHandler({
    authenticate: allowedUser,
    store: fakeStore({ backup: validBackup, etag: '"v7"' }),
    expectedOrigin,
  });
  const response = await handler(getStateRequest());

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { backup: validBackup, notice: null });
  assert.equal(response.headers.get("etag"), '"v7"');
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("GET upgrades v6 in memory and preserves the original ETag for a conditional save", async () => {
  const store = fakeStore({ backup: legacyV6Backup, etag: '"legacy-etag"' });
  const handler = createStateHandler({ authenticate: allowedUser, store, expectedOrigin });
  const response = await handler(getStateRequest());
  const body = await response.json();
  const upgraded = JSON.parse(body.backup);

  assert.equal(response.status, 200);
  assert.equal(upgraded.schemaVersion, 7);
  assert.deepEqual(Object.keys(upgraded.data).sort(), [
    "commitments",
    "houses",
    "income",
    "lifestyle",
    "spending",
  ]);
  assert.deepEqual(upgraded.data.spending, []);
  assert.match(body.notice, /check-in/i);
  assert.equal(response.headers.get("etag"), '"legacy-etag"');
  assert.equal(store.writeCalls.length, 0);

  const save = await handler(
    putRequest(body.backup, { ifMatch: response.headers.get("etag") }),
  );

  assert.equal(save.status, 200);
  assert.deepEqual(store.writeCalls[0].conditions, { etag: '"legacy-etag"' });
});

test("GET reports absence only when the blob store returns null", async () => {
  const handler = createStateHandler({
    authenticate: allowedUser,
    store: fakeStore(),
    expectedOrigin,
  });
  const response = await handler(getStateRequest());

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "state_not_found" });
});

test("invalid stored state is a server error rather than an empty store", async () => {
  const handler = createStateHandler({
    authenticate: allowedUser,
    store: fakeStore({ backup: "not a backup", etag: '"v1"' }),
    expectedOrigin,
  });
  const response = await handler(getStateRequest());

  assert.equal(response.status, 500);
  assert.notDeepEqual(await response.json(), { error: "state_not_found" });
});

test("malformed, invalid, and newer-schema backups are rejected before a write", async () => {
  const store = fakeStore();
  const handler = createStateHandler({ authenticate: allowedUser, store, expectedOrigin });
  const malformed = await handler(
    new Request(`${expectedOrigin}/api/state`, {
      method: "PUT",
      headers: { origin: expectedOrigin, "content-type": "application/json" },
      body: "{",
    }),
  );
  const invalid = await handler(putRequest("not a backup", { ifNoneMatch: true }));
  const newer = await handler(
    putRequest(JSON.stringify({ schemaVersion: 999, data: {} }), { ifNoneMatch: true }),
  );

  assert.equal(malformed.status, 400);
  assert.equal(invalid.status, 400);
  assert.equal(newer.status, 400);
  assert.equal(store.writeCalls.length, 0);
});

test("invalid version 7 Spending data is rejected before the store changes", async () => {
  const store = fakeStore();
  const handler = createStateHandler({ authenticate: allowedUser, store, expectedOrigin });
  const invalid = JSON.stringify({
    schemaVersion: 7,
    data: {
      income: 0,
      commitments: [],
      lifestyle: [],
      houses: [],
      spending: [{
        id: "s1",
        date: "2026-10-13",
        categoryId: "missing",
        amount: 10,
        description: "Lunch",
      }],
    },
  });
  const response = await handler(putRequest(invalid, { ifNoneMatch: true }));

  assert.equal(response.status, 400);
  assert.equal(store.writeCalls.length, 0);
  assert.equal(store.currentBackup, null);
});

test("oversized backup payloads are rejected before a write", async () => {
  const store = fakeStore();
  const handler = createStateHandler({ authenticate: allowedUser, store, expectedOrigin });
  const response = await handler(
    putRequest("x".repeat(2 * 1024 * 1024 + 1), { ifNoneMatch: true }),
  );

  assert.equal(response.status, 413);
  assert.equal(store.writeCalls.length, 0);
});

test("the first write is conditional on the state key being absent", async () => {
  const store = fakeStore();
  const handler = createStateHandler({ authenticate: allowedUser, store, expectedOrigin });
  const response = await handler(putRequest(validBackup, { ifNoneMatch: true }));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("etag"), '"v2"');
  assert.deepEqual(store.writeCalls[0].conditions, { onlyIfNew: true });
});

test("an update uses the caller's matching ETag", async () => {
  const store = fakeStore({ backup: validBackup, etag: '"v1"' });
  const handler = createStateHandler({ authenticate: allowedUser, store, expectedOrigin });
  const response = await handler(putRequest(validBackup, { ifMatch: '"v1"' }));

  assert.equal(response.status, 200);
  assert.deepEqual(store.writeCalls[0].conditions, { etag: '"v1"' });
});

test("a stale state update does not replace the existing blob", async () => {
  const store = fakeStore({ backup: validBackup, etag: '"v2"', conflict: true });
  const handler = createStateHandler({ authenticate: allowedUser, store, expectedOrigin });
  const response = await handler(putRequest(validBackup, { ifMatch: '"v1"' }));

  assert.equal(response.status, 409);
  assert.equal(store.writeCalls.length, 1);
  assert.equal(store.currentEtag, '"v2"');
});

test("writes without a conditional header or with the wrong content type are rejected", async () => {
  const store = fakeStore();
  const handler = createStateHandler({ authenticate: allowedUser, store, expectedOrigin });
  const noPrecondition = await handler(putRequest(validBackup));
  const wrongContentType = await handler(
    putRequest(validBackup, { ifNoneMatch: true, contentType: "text/plain" }),
  );

  assert.equal(noPrecondition.status, 428);
  assert.equal(wrongContentType.status, 415);
  assert.equal(store.writeCalls.length, 0);
});

test("storage failures are not reported as an empty state", async () => {
  const handler = createStateHandler({
    authenticate: allowedUser,
    store: { read: async () => { throw new Error("storage offline"); }, write: async () => ({}) },
    expectedOrigin,
  });
  const response = await handler(getStateRequest());

  assert.equal(response.status, 503);
});

test("an unrelated storage error cannot masquerade as an ETag conflict", async () => {
  const store = {
    async read() {
      return null;
    },
    async write() {
      throw Object.assign(new Error("storage unavailable"), { name: "StateConflictError" });
    },
  };
  const handler = createStateHandler({ authenticate: allowedUser, store, expectedOrigin });
  const response = await handler(putRequest(validBackup, { ifNoneMatch: true }));

  assert.equal(response.status, 503);
});

test("the Blobs adapter uses metadata ETags and conditional writes", async () => {
  const calls = [];
  const netlifyStore = {
    async getWithMetadata(key, options) {
      calls.push({ method: "getWithMetadata", key, options });
      return { data: validBackup, etag: '"v4"' };
    },
    async set(key, value, options) {
      calls.push({ method: "set", key, value, options });
      return { modified: true, etag: '"v5"' };
    },
  };
  const adapter = createBlobStateStore(netlifyStore);

  assert.deepEqual(await adapter.read(), { backup: validBackup, etag: '"v4"' });
  assert.deepEqual(await adapter.write(validBackup, { onlyIfNew: true }), { etag: '"v5"' });
  assert.deepEqual(calls[0], {
    method: "getWithMetadata",
    key: "state",
    options: { type: "text" },
  });
  assert.deepEqual(calls[1], {
    method: "set",
    key: "state",
    value: validBackup,
    options: { onlyIfNew: true },
  });
});

test("the Blobs adapter turns an unmodified conditional write into a conflict", async () => {
  const adapter = createBlobStateStore({
    async set() {
      return { modified: false };
    },
  });

  await assert.rejects(
    adapter.write(validBackup, { etag: '"v1"' }),
    StateConflictError,
  );
});

test("the site-wide store uses strong consistency for migration-safe reads", async () => {
  let storeOptions;
  const configuredStore = stateModule.createDefaultStateStore((name, options) => {
    assert.equal(name, "expenses-calculator");
    storeOptions = options;
    return {
      async getWithMetadata() {
        return null;
      },
    };
  });

  assert.equal(await configuredStore.read(), null);
  assert.deepEqual(storeOptions, { consistency: "strong" });
});
