import http from "node:http";
import { readFile } from "node:fs/promises";
import { createServer } from "../server.js";

const app = createServer();
const fixtures = new Map([
  ["/test/browser/ui-regressions.html", new URL("../test/browser/ui-regressions.html", import.meta.url)],
  ["/test/helpers/renovation-fixture.js", new URL("../test/helpers/renovation-fixture.js", import.meta.url)],
]);
const server = http.createServer(async (request, response) => {
  const path = request.url.split("?")[0];
  if (!fixtures.has(path)) {
    app.emit("request", request, response);
    return;
  }
  if (request.method !== "GET") {
    response.writeHead(405, { allow: "GET" }).end();
    return;
  }
  try {
    const body = await readFile(fixtures.get(path));
    response.writeHead(200, {
      "content-type": path.endsWith(".html") ? "text/html; charset=utf-8" : "text/javascript; charset=utf-8",
      "cache-control": "no-store",
    }).end(body);
  } catch (error) {
    console.error(error);
    response.writeHead(500).end("UI test fixture could not be loaded.");
  }
});
server.listen(0, "127.0.0.1", () => {
  console.log(`UI regression tests: http://127.0.0.1:${server.address().port}/test/browser/ui-regressions.html`);
});
