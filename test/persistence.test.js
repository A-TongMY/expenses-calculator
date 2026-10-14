import { test } from "node:test";
import assert from "node:assert/strict";
import { StorageConflictError } from "../storage.js";

const persistenceModule = await import("../persistence.js").catch(() => null);
assert.ok(persistenceModule, "the serialized remote save queue must exist");
const { createSaveQueue } = persistenceModule;

const state = (income) => ({
  income,
  commitments: [],
  lifestyle: [],
  houses: [],
  spending: [],
});

test("rapid queued changes coalesce to the newest snapshot", async () => {
  const calls = [];
  const statuses = [];
  const queue = createSaveQueue({
    etag: '"v1"',
    delay: 60_000,
    save: async (snapshot, etag) => {
      calls.push({ snapshot, etag });
      return '"v2"';
    },
    onStatus: (status) => statuses.push(status),
  });
  queue.enqueue(state(100));
  queue.enqueue(state(200));

  await queue.flush();

  assert.deepEqual(calls, [{ snapshot: state(200), etag: '"v1"' }]);
  assert.deepEqual(statuses, ["saving", "saved"]);
});

test("enqueue immediately reports that edits are waiting to be saved", (t) => {
  const statuses = [];
  const queue = createSaveQueue({
    delay: 60_000,
    save: async () => '"v1"',
    onStatus: (status) => statuses.push(status),
  });
  t.after(() => queue.stop());

  queue.enqueue(state(100));

  assert.deepEqual(statuses, ["saving"]);
});

test("successful writes advance ETags in order", async () => {
  const calls = [];
  const queue = createSaveQueue({
    etag: '"v1"',
    delay: 60_000,
    save: async (snapshot, etag) => {
      calls.push({ snapshot, etag });
      return `"v${calls.length + 1}"`;
    },
  });

  queue.enqueue(state(100));
  await queue.flush();
  queue.enqueue(state(200));
  await queue.flush();

  assert.deepEqual(calls, [
    { snapshot: state(100), etag: '"v1"' },
    { snapshot: state(200), etag: '"v2"' },
  ]);
});

test("a newer snapshot waits for an in-flight write and then saves in order", async () => {
  let releaseFirst;
  let startedFirst;
  const calls = [];
  const firstStarted = new Promise((resolve) => {
    startedFirst = resolve;
  });
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const statuses = [];
  const queue = createSaveQueue({
    etag: '"v1"',
    delay: 60_000,
    save: async (snapshot, etag) => {
      calls.push({ snapshot, etag });
      if (calls.length === 1) {
        startedFirst();
        await firstGate;
      }
      return `"v${calls.length + 1}"`;
    },
    onStatus: (status) => statuses.push(status),
  });
  queue.enqueue(state(100));
  const firstFlush = queue.flush();
  await firstStarted;
  queue.enqueue(state(200));
  const secondFlush = queue.flush();
  await Promise.resolve();

  assert.equal(calls.length, 1);
  releaseFirst();
  await Promise.all([firstFlush, secondFlush]);

  assert.deepEqual(calls, [
    { snapshot: state(100), etag: '"v1"' },
    { snapshot: state(200), etag: '"v2"' },
  ]);
  assert.deepEqual(statuses, ["saving", "saved"]);
});

test("a failed save pauses the queue instead of claiming success", async () => {
  let calls = 0;
  const statuses = [];
  const failure = new Error("network unavailable");
  const queue = createSaveQueue({
    etag: '"v1"',
    delay: 60_000,
    save: async () => {
      calls += 1;
      throw failure;
    },
    onStatus: (status) => statuses.push(status),
  });
  queue.enqueue(state(100));

  await assert.rejects(queue.flush(), failure);
  queue.enqueue(state(200));
  await assert.rejects(queue.flush(), failure);

  assert.equal(calls, 1);
  assert.deepEqual(statuses, ["saving", "error"]);
});

test("a conflict pauses writes until the app reloads and resets the queue", async () => {
  let calls = 0;
  const statuses = [];
  const conflict = new StorageConflictError();
  const queue = createSaveQueue({
    etag: '"v1"',
    delay: 60_000,
    save: async () => {
      calls += 1;
      throw conflict;
    },
    onStatus: (status) => statuses.push(status),
  });
  queue.enqueue(state(100));

  await assert.rejects(queue.flush(), StorageConflictError);
  assert.equal(calls, 1);
  assert.deepEqual(statuses, ["saving", "conflict"]);
});

test("reset discards stale pending data and resumes from the loaded remote ETag", async () => {
  const calls = [];
  let firstAttempt = true;
  const queue = createSaveQueue({
    etag: '"v1"',
    delay: 60_000,
    save: async (snapshot, etag) => {
      calls.push({ snapshot, etag });
      if (firstAttempt) {
        firstAttempt = false;
        throw new StorageConflictError();
      }
      return '"v3"';
    },
  });
  queue.enqueue(state(100));
  await assert.rejects(queue.flush(), StorageConflictError);
  queue.reset('"v2"');
  queue.enqueue(state(300));

  await queue.flush();

  assert.deepEqual(calls, [
    { snapshot: state(100), etag: '"v1"' },
    { snapshot: state(300), etag: '"v2"' },
  ]);
});
