import { test } from "node:test";
import assert from "node:assert/strict";
import { renovationDate, renovationMonth } from "../renovation-calendar.js";

test("Malaysia midnight advances accounting day and month before UTC", () => {
  assert.equal(renovationDate(new Date("2026-10-31T15:59:59Z")), "2026-10-31");
  assert.equal(renovationDate(new Date("2026-10-31T16:00:00Z")), "2026-11-01");
  assert.equal(renovationMonth(new Date("2026-10-31T16:00:00Z")), "2026-11");
});
