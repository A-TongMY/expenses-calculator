import { test } from "node:test";
import assert from "node:assert/strict";
import { getStore } from "@netlify/blobs";
import { importBackup } from "../backup.js";
import { createStorageClient, StorageConflictError } from "../storage.js";
import { createStateHandler } from "../netlify/functions/state.js";
import { createBlobStateStore } from "../netlify/functions/_shared/blob-state-store.js";
import { emptyRenovation, fixture } from "./helpers/renovation-fixture.js";

const origin = "https://expenses.example";
const emptyState = { ...emptyRenovation(), income: 0, commitments: [], lifestyle: [], houses: [], spending: [] };

function headerStrippingTransport() {
  let backup = null;
  let version = 0;
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
      assert.ok(create || match, "the adapter must always send an atomic SDK condition");
      if ((create && backup !== null) || (match && (backup === null || match !== etag))) {
        return new Response(null, { status: 412 });
      }
      backup = options.body;
      version += 1;
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
      if (options.method === "PUT") headers.set("origin", origin);
      return handler(new Request(`${origin}${path}`, { ...options, headers }));
    },
  });
}

test("manual first save survives stripped conditional headers and persists across reload", async () => {
  const client = headerStrippingTransport();
  assert.deepEqual(await client.loadState(), { status: "empty" });
  const etag = await client.saveState({ ...emptyState, income: 5000 }, null);

  assert.equal(etag, '"v1"');
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
  await client.saveState(imported, null);

  assert.deepEqual((await client.loadState()).state, {
    ...emptyRenovation(),
    income: 5000,
    commitments: [{ id: "rent", name: "Rent", amount: 1500, everyMonths: 1 }],
    lifestyle: [],
    houses: [],
    spending: [],
  });
});

test("legacy import survives stripped headers without overwriting a competing first save", async () => {
  const client = headerStrippingTransport();
  const legacyBackup = JSON.stringify({
    schemaVersion: 6,
    data: { income: 4200, commitments: [], lifestyle: [], houses: [], checkIns: [] },
  });
  const migrated = await client.migrateLegacyState(legacyBackup);

  assert.equal(migrated.etag, '"v1"');
  assert.equal((await client.loadState()).state.income, 4200);
  assert.deepEqual((await client.loadState()).state.spending, []);
  await assert.rejects(client.saveState({ ...emptyState, income: 9000 }, null), StorageConflictError);
  assert.equal((await client.loadState()).state.income, 4200);
});

test("updates survive stripped headers while stale versions still conflict", async () => {
  const client = headerStrippingTransport();
  const firstEtag = await client.saveState({ ...emptyState, income: 5000 }, null);
  const nextEtag = await client.saveState({ ...emptyState, income: 6000 }, firstEtag);

  assert.equal(nextEtag, '"v2"');
  await assert.rejects(client.saveState({ ...emptyState, income: 7000 }, firstEtag), StorageConflictError);
  assert.equal((await client.loadState()).state.income, 6000);
});

test("conditional transport preserves canonical Spending entries on create and update", async () => {
  const client = headerStrippingTransport();
  const state = {
    ...emptyState,
    lifestyle: [{ id: "food", name: "Food", low: 400, high: 600, everyMonths: 1 }],
    spending: [{
      id: "lunch",
      date: "2026-10-14",
      categoryId: "food",
      amount: 15,
      description: "Lunch",
    }],
  };
  const etag = await client.saveState(state, null);
  assert.deepEqual((await client.loadState()).state, state);

  const updated = { ...state, spending: [{ ...state.spending[0], amount: 20 }] };
  await client.saveState(updated, etag);
  assert.deepEqual((await client.loadState()).state, updated);
});

test("Renovation persists through SDK conditional saves when transport drops headers", async () => {
  const client = headerStrippingTransport();
  const state = fixture();
  const etag = await client.saveState(state, null);
  assert.deepEqual((await client.loadState()).state, state);
  const updated = {
    ...state,
    renovationPayments: [...state.renovationPayments, {
      id: "oct", itemId: "cabinets", date: "2026-10-14",
      amount: 400, kind: "payment", installmentMonth: "2026-10",
    }],
  };
  await client.saveState(updated, etag);
  assert.deepEqual((await client.loadState()).state, updated);
  await assert.rejects(client.saveState(state, etag), StorageConflictError);
  assert.deepEqual((await client.loadState()).state, updated);
});
