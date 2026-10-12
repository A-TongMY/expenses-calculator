import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { pathToFileURL } from "node:url";

const PUBLIC_FILES = new Set([
  "index.html",
  "styles.css",
  "app.js",
  "calc.js",
  "backup.js",
  "rules.js",
  "format.js",
  "storage.js",
  "checkins.js",
  "loan.js",
  "houses.js",
  "ui.js",
  "charts.js",
  "reports.js",
  "home.js",
]);

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "content-security-policy":
    "default-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
  "cache-control": "no-cache",
};

function send(res, status, headers, body) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

export function createServer({ root = new URL("./", import.meta.url) } = {}) {
  return http.createServer(async (req, res) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") {
        send(res, 405, { allow: "GET, HEAD" });
        return;
      }
      // Matched on the raw path: parsing it as a URL throws on inputs like "//x:99999/".
      const path = req.url.split("?")[0];
      const name = path === "/" ? "index.html" : path.slice(1);
      if (!PUBLIC_FILES.has(name)) {
        send(res, 404, { "content-type": "text/plain; charset=utf-8" }, "Not found");
        return;
      }
      const body = await readFile(new URL(name, root));
      send(res, 200, { "content-type": CONTENT_TYPES[extname(name)] }, body);
    } catch {
      if (!res.headersSent) send(res, 500, { "content-type": "text/plain; charset=utf-8" }, "Server error");
      else res.destroy();
    }
  });
}

// Listen only when run directly (npm start); tests import createServer and pick their own port.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, "0.0.0.0", () => {
    console.log(`Expenses Calculator listening on port ${port}`);
  });
}
