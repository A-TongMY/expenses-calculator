import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server.js";

let server;
let base;

before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

const get = (path, options) =>
  fetch(`${base}${path}`, { signal: AbortSignal.timeout(2000), ...options });

after(() => new Promise((resolve) => server.close(resolve)));

test("the root path serves the app page", async () => {
  const response = await get("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^text\/html/);
  assert.match(await response.text(), /<title>Expenses Calculator<\/title>/);
});

const publicFiles = {
  "/index.html": /^text\/html/,
  "/app.js": /^text\/javascript/,
  "/calc.js": /^text\/javascript/,
  "/backup.js": /^text\/javascript/,
  "/rules.js": /^text\/javascript/,
  "/styles.css": /^text\/css/,
};

for (const [path, contentType] of Object.entries(publicFiles)) {
  test(`${path} is served with the right content type`, async () => {
    const response = await get(path);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), contentType);
  });
}

const privatePaths = [
  "/server.js",
  "/package.json",
  "/GLOSSARY.md",
  "/test/calc.test.js",
  "/.git/config",
  "/%2e%2e/package.json",
  "/__proto__",
];

for (const path of privatePaths) {
  test(`${path} is not served`, async () => {
    const response = await get(path);
    assert.equal(response.status, 404);
  });
}

test("methods other than GET and HEAD are refused", async () => {
  const response = await get("/", { method: "POST" });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, HEAD");
});

test("a HEAD request returns the headers without a body", async () => {
  const response = await get("/", { method: "HEAD" });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^text\/html/);
  assert.equal(await response.text(), "");
});

test("responses carry security headers", async () => {
  for (const path of ["/", "/missing"]) {
    const response = await get(path);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
  }
});
