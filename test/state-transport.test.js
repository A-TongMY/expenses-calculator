import { test } from "node:test";
import assert from "node:assert/strict";
import { getStore } from "@netlify/blobs";
import { importBackup } from "../backup.js";
import { createStorageClient, StorageConflictError, StorageError } from "../storage.js";
import { createStateHandler } from "../netlify/functions/state.js";
import { createBlobStateStore } from "../netlify/functions/_shared/blob-state-store.js";
import { createSaveQueue } from "../persistence.js";
import { emptyRenovation, fixture } from "./helpers/renovation-fixture.js";

const origin = "https://expenses.example";
const emptyState = { ...emptyRenovation(), income: 0, commitments: [], lifestyle: [], houses: [], spending: [] };

function headerStrippingTransport({
  responseEtag, omitResponseVersion = false, loseFirstWriteResponse = false,
  failures = { remaining: 0 }, onWrite = () => {},
} = {}) {
  let backup = null;
  let version = 0;
  let loseResponse = loseFirstWriteResponse;
  const sdkStore = getStore("expenses-calculator", {
    siteID: "synthetic-site",
    token: "synthetic-token",
    consistency: "strong",
    edgeURL: "https://cached.example",
    uncachedEdgeURL: "https://storage.example",
    fetch: async (url, options) => {
      assert.equal(new URL(url).origin, "https://storage.example");
      assert.equal(new URL(url).pathname, "/synthetic-site/site:expenses-calculator/state");
      const etag = `"v${version}"`;
      if (options.method === "get") {
        return backup === null
          ? new Response(null, { status: 404 })
          : new Response(backup, { headers: { etag } });
      }
      assert.equal(options.method, "put");
      const headers = new Headers(options.headers);
      const create = headers.get("if-none-match") === "*";
      const match = headers.get("if-match");
      onWrite({ backup: options.body, create, match });
      if ((create && backup !== null) || (match && (backup === null || match !== etag))) {
        return new Response(null, { status: 412 });
      }
      backup = options.body;
      version += 1;
      if (loseResponse) {
        loseResponse = false;
        return new Response(null, { status: 503 });
      }
      return new Response(null, { headers: { etag: `"v${version}"` } });
    },
  });
  const handler = createStateHandler({
    authenticate: async () => 45504842,
    expectedOrigin: origin,
    store: createBlobStateStore(sdkStore),
  });
  return createStorageClient({
    fetchImpl: async (path, options) => {
      const headers = new Headers(options.headers);
      headers.delete("if-match");
      headers.delete("if-none-match");
      if (options.method === "PUT") {
        headers.set("origin", origin);
        if (failures.remaining > 0) {
          failures.remaining -= 1;
          return Response.json({ error: "storage_unavailable" }, { status: 503 });
        }
      }
      const response = await handler(new Request(`${origin}${path}`, { ...options, headers }));
      if (response.status !== 200) return response;
      const responseHeaders = new Headers(response.headers);
      if (responseEtag === null) responseHeaders.delete("etag");
      else if (responseEtag !== undefined) responseHeaders.set("etag", responseEtag);
      const body = await response.json();
      if (omitResponseVersion) delete body.stateVersion;
      return Response.json(body, { status: response.status, headers: responseHeaders });
    },
  });
}

test("manual first save survives stripped headers and persists across reload", async () => {
  const client = headerStrippingTransport();
  assert.deepEqual(await client.loadState(), { status: "empty" });
  await client.saveState({ ...emptyState, income: 5000 });
  assert.equal((await client.loadState()).state.income, 5000);
});

test("a local-storage-era backup imported through normal save persists after header stripping", async () => {
  const client = headerStrippingTransport();
  const imported = importBackup(JSON.stringify({
    schemaVersion: 1,
    data: {
      income: 5000,
      commitments: [{ id: "rent", name: "Rent", amount: 1500, everyMonths: 1 }],
    },
  }));
  await client.saveState(imported);
  assert.deepEqual((await client.loadState()).state, {
    ...emptyRenovation(),
    income: 5000,
    commitments: [{ id: "rent", name: "Rent", amount: 1500, everyMonths: 1 }],
    lifestyle: [], houses: [], spending: [],
  });
});

test("migration stays create-only while explicit import can replace its saved state", async () => {
  const client = headerStrippingTransport();
  const legacyBackup = JSON.stringify({
    schemaVersion: 6,
    data: { income: 4200, commitments: [], lifestyle: [], houses: [], checkIns: [] },
  });
  await client.migrateLegacyState(legacyBackup);
  await assert.rejects(client.migrateLegacyState(legacyBackup), StorageConflictError);
  assert.equal((await client.loadState()).state.income, 4200);
  await client.saveState({ ...emptyState, income: 9000 });
  assert.equal((await client.loadState()).state.income, 9000);
});

test("an old loaded snapshot can replace newer saved data under last-write-wins", async () => {
  const client = headerStrippingTransport();
  await client.saveState({ ...emptyState, income: 5000 });
  const oldSnapshot = (await client.loadState()).state;
  await client.saveState({ ...emptyState, income: 6000 });
  await client.saveState({ ...oldSnapshot, income: 7000 });
  assert.equal((await client.loadState()).state.income, 7000);
});

test("unconditional transport preserves canonical Spending entries on create and update", async () => {
  const client = headerStrippingTransport();
  const state = {
    ...emptyState,
    lifestyle: [{ id: "food", name: "Food", low: 400, high: 600, everyMonths: 1 }],
    spending: [{ id: "lunch", date: "2026-10-14", categoryId: "food", amount: 15, description: "Lunch" }],
  };
  await client.saveState(state);
  assert.deepEqual((await client.loadState()).state, state);
  const updated = { ...state, spending: [{ ...state.spending[0], amount: 20 }] };
  await client.saveState(updated);
  assert.deepEqual((await client.loadState()).state, updated);
});

test("Renovation persists through SDK saves when transport drops headers", async () => {
  const client = headerStrippingTransport();
  const state = fixture();
  await client.saveState(state);
  assert.deepEqual((await client.loadState()).state, state);
  const updated = {
    ...state,
    renovationPayments: [...state.renovationPayments, {
      id: "oct", itemId: "cabinets", date: "2026-10-14",
      amount: 400, kind: "payment", installmentMonth: "2026-10",
    }],
  };
  await client.saveState(updated);
  assert.deepEqual((await client.loadState()).state, updated);
});

test("import replacement followed by manual edits across modules keeps saving", async (t) => {
  const client = headerStrippingTransport();
  await client.saveState({ ...emptyState, income: 5000 });
  const statuses = [];
  const queue = createSaveQueue({
    delay: 60_000,
    save: (state) => client.saveState(state),
    onStatus: (status) => statuses.push(status),
  });
  t.after(() => queue.stop());
  const imported = importBackup(JSON.stringify({
    schemaVersion: 6,
    data: { income: 4200, commitments: [], lifestyle: [], houses: [], checkIns: [] },
  }));
  queue.enqueue(imported);
  await queue.flush();
  assert.deepEqual((await client.loadState()).state, imported);
  const expenses = {
    ...imported,
    commitments: [{ id: "rent", name: "Rent", amount: 1000, everyMonths: 1 }],
    lifestyle: [{ id: "food", name: "Food", low: 400, high: 600, everyMonths: 1 }],
  };
  queue.enqueue(expenses);
  await queue.flush();
  assert.deepEqual((await client.loadState()).state, expenses);
  const spending = {
    ...expenses,
    spending: [{ id: "lunch", date: "2026-10-14", categoryId: "food", amount: 15, description: "Lunch" }],
  };
  queue.enqueue(spending);
  await queue.flush();
  assert.deepEqual((await client.loadState()).state, spending);
  const houses = { ...spending, houses: fixture().houses };
  queue.enqueue(houses);
  await queue.flush();
  assert.deepEqual((await client.loadState()).state, houses);
  const renovation = {
    ...houses,
    renovationCategories: fixture().renovationCategories,
    renovationItems: fixture().renovationItems,
    renovationPayments: fixture().renovationPayments,
  };
  queue.enqueue(renovation);
  await queue.flush();
  assert.deepEqual((await client.loadState()).state, renovation);
  assert.deepEqual(statuses, [
    "saving", "saved", "saving", "saved", "saving", "saved",
    "saving", "saved", "saving", "saved",
  ]);
});

test("import during an in-flight manual save persists before subsequent edits", async (t) => {
  const client = headerStrippingTransport();
  await client.saveState({ ...emptyState, income: 5000 });
  let release;
  let signalStarted;
  const gate = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { signalStarted = resolve; });
  let holdFirst = true;
  const queue = createSaveQueue({
    delay: 60_000,
    save: async (state) => {
      if (holdFirst) {
        holdFirst = false;
        signalStarted();
        await gate;
      }
      return client.saveState(state);
    },
  });
  t.after(() => { release(); queue.stop(); });
  queue.enqueue({ ...emptyState, income: 6000 });
  const manualFlush = queue.flush();
  await started;
  const imported = fixture();
  queue.enqueue(imported);
  const importFlush = queue.flush();
  release();
  await Promise.all([manualFlush, importFlush]);
  assert.deepEqual((await client.loadState()).state, imported);
  const edited = { ...imported, income: 7000 };
  queue.enqueue(edited);
  await queue.flush();
  assert.deepEqual((await client.loadState()).state, edited);
});

for (const responseEtag of ['W/"http-representation"', null]) {
  test(`import then manual edits work without JSON versions and response ETag ${responseEtag}`, async (t) => {
    const client = headerStrippingTransport({ responseEtag, omitResponseVersion: true });
    await client.saveState(fixture());
    const queue = createSaveQueue({ delay: 60_000, save: (state) => client.saveState(state) });
    t.after(() => queue.stop());
    const edited = { ...fixture(), income: 7000 };
    queue.enqueue(edited);
    await queue.flush();
    assert.deepEqual((await client.loadState()).state, edited);
  });
}

test("manual entries save consecutively without import when response ETags are rewritten", async () => {
  const client = headerStrippingTransport({ responseEtag: '"http-only"', omitResponseVersion: true });
  const first = { ...emptyState, income: 5000 };
  await client.saveState(first);
  const second = {
    ...first, commitments: [{ id: "rent", name: "Rent", amount: 1000, everyMonths: 1 }],
  };
  await client.saveState(second);
  assert.deepEqual((await client.loadState()).state, second);
});

test("a committed SDK write with a lost acknowledgement retries without a false conflict", async () => {
  const writes = [];
  const client = headerStrippingTransport({
    loseFirstWriteResponse: true, onWrite: (write) => writes.push(write),
  });
  const imported = fixture();
  await client.saveState(imported);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].create, false);
  assert.equal(writes[0].match, null);
  assert.deepEqual(writes[1], writes[0]);
  assert.deepEqual((await client.loadState()).state, imported);
  const edited = { ...imported, income: 7000 };
  await client.saveState(edited);
  assert.deepEqual((await client.loadState()).state, edited);
});

test("a failed save can be replaced by import and later manual edits through the real transport", async (t) => {
  const failures = { remaining: 1 };
  const client = headerStrippingTransport({ failures });
  const statuses = [];
  const queue = createSaveQueue({
    delay: 60_000, save: (state) => client.saveState(state),
    onStatus: (status) => statuses.push(status),
  });
  t.after(() => queue.stop());
  queue.enqueue({ ...emptyState, income: 5000 });
  await assert.rejects(queue.flush(), StorageError);
  assert.deepEqual(await client.loadState(), { status: "empty" });
  const imported = fixture();
  queue.enqueue(imported);
  await queue.flush();
  assert.deepEqual((await client.loadState()).state, imported);
  const edited = { ...imported, income: 7000 };
  queue.enqueue(edited);
  await queue.flush();
  assert.deepEqual((await client.loadState()).state, edited);
  assert.deepEqual(statuses, ["saving", "error", "saving", "saved", "saving", "saved"]);
});
