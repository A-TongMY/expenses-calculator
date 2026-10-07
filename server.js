import http from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const HTML = "text/html; charset=utf-8";
const JS = "text/javascript; charset=utf-8";
const CSS = "text/css; charset=utf-8";

const PUBLIC_FILES = new Map([
  ["/", { file: "index.html", type: HTML }],
  ["/index.html", { file: "index.html", type: HTML }],
  ["/app.js", { file: "app.js", type: JS }],
  ["/calc.js", { file: "calc.js", type: JS }],
  ["/backup.js", { file: "backup.js", type: JS }],
  ["/rules.js", { file: "rules.js", type: JS }],
  ["/styles.css", { file: "styles.css", type: CSS }],
]);

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "content-security-policy":
    "default-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'",
  "cache-control": "no-cache",
};

export function createServer() {
  return http.createServer(async (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { ...SECURITY_HEADERS, allow: "GET, HEAD" });
      res.end();
      return;
    }
    const { pathname } = new URL(req.url, "http://localhost");
    const entry = PUBLIC_FILES.get(pathname);
    if (!entry) {
      res.writeHead(404, { ...SECURITY_HEADERS, "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const body = await readFile(new URL(entry.file, import.meta.url));
    res.writeHead(200, { ...SECURITY_HEADERS, "content-type": entry.type });
    res.end(body);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, "0.0.0.0", () => {
    console.log(`Expenses Calculator listening on port ${port}`);
  });
}
