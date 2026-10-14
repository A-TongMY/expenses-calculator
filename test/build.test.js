import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("publishes only the browser asset allowlist", async (t) => {
  const buildModule = await import("../build.js").catch(() => null);
  assert.ok(buildModule, "build.js must exist");
  assert.equal(typeof buildModule.buildSite, "function");
  const filesModule = await import("../public-files.js").catch(() => null);
  assert.ok(filesModule, "public-files.js must exist");
  const { PUBLIC_FILES } = filesModule;
  assert.ok(PUBLIC_FILES.includes("bootstrap.js"));
  assert.ok(PUBLIC_FILES.includes("persistence.js"));
  assert.ok(PUBLIC_FILES.includes("spending.js"));
  assert.ok(PUBLIC_FILES.includes("spending-ui.js"));
  assert.ok(PUBLIC_FILES.includes("spending-summary.js"));
  assert.ok(!PUBLIC_FILES.includes("checkins.js"));

  const root = await mkdtemp(join(tmpdir(), "expenses-source-"));
  const output = join(root, "dist");
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(join(root, "test"), { recursive: true });
  for (const filename of PUBLIC_FILES) await writeFile(join(root, filename), "public");
  await writeFile(join(root, "package.json"), "{\"private\":true}");
  await writeFile(join(root, "test", "secret.txt"), "not public");
  await mkdir(output);
  await writeFile(join(output, "stale.html"), "from an old build");
  await writeFile(join(output, "stale.html"), "from an old build");

  await buildModule.buildSite({ root, output });

  assert.deepEqual((await readdir(output)).sort(), [...PUBLIC_FILES].sort());
});
