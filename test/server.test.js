import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { pathToFileURL } from "node:url";
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
  "/format.js": /^text\/javascript/,
  "/storage.js": /^text\/javascript/,
  "/checkins.js": /^text\/javascript/,
  "/loan.js": /^text\/javascript/,
  "/houses.js": /^text\/javascript/,
  "/ui.js": /^text\/javascript/,
  "/charts.js": /^text\/javascript/,
  "/reports.js": /^text\/javascript/,
  "/home.js": /^text\/javascript/,
  "/bootstrap.js": /^text\/javascript/,
  "/persistence.js": /^text\/javascript/,
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
  "/netlify/functions/state.js",
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

const rawGet = (path) =>
  new Promise((resolve, reject) => {
    const { port } = server.address();
    const request = http.request({ host: "127.0.0.1", port, path, timeout: 2000 }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode));
    });
    request.on("timeout", () => request.destroy(new Error("no answer")));
    request.on("error", reject);
    request.end();
  });

test("a request path that is not a valid URL is refused and the server keeps serving", async () => {
  assert.equal(await rawGet("//x:99999/app.js"), 404);
  assert.equal((await get("/")).status, 200);
});

test("a path starting with two slashes is not treated as the app page", async () => {
  assert.equal((await get("//app.js")).status, 404);
});

test("a file that cannot be read gives a 500 and the server keeps running", async () => {
  const emptyRoot = pathToFileURL(`${mkdtempSync(join(tmpdir(), "empty-root-"))}${sep}`);
  const broken = createServer({ root: emptyRoot });
  await new Promise((resolve) => broken.listen(0, "127.0.0.1", resolve));
  try {
    const url = `http://127.0.0.1:${broken.address().port}`;
    const options = { signal: AbortSignal.timeout(2000) };
    assert.equal((await fetch(`${url}/`, options)).status, 500);
    assert.equal((await fetch(`${url}/`, options)).status, 500);
  } finally {
    await new Promise((resolve) => broken.close(resolve));
  }
});

test("the content security policy forbids framing and plugins", async () => {
  const policy = (await get("/")).headers.get("content-security-policy");
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(policy, /object-src 'none'/);
});
