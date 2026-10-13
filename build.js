import { copyFile, lstat, mkdir, rm } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PUBLIC_FILES } from "./public-files.js";

const directoryOf = (value) =>
  value instanceof URL ? fileURLToPath(value) : resolve(value);

export async function buildSite({
  root = fileURLToPath(new URL(".", import.meta.url)),
  output,
} = {}) {
  const rootPath = directoryOf(root);
  const outputPath = resolve(output ?? join(rootPath, "dist"));
  const outputRelativePath = relative(rootPath, outputPath);
  if (
    !outputRelativePath ||
    outputRelativePath === ".." ||
    outputRelativePath.startsWith(`..${sep}`) ||
    isAbsolute(outputRelativePath)
  ) {
    throw new Error("The build output must be a child directory of the source root.");
  }

  await rm(outputPath, { recursive: true, force: true });
  await mkdir(outputPath, { recursive: true });
  for (const filename of PUBLIC_FILES) {
    const sourcePath = join(rootPath, filename);
    if (!(await lstat(sourcePath)).isFile()) {
      throw new Error(`Public asset "${filename}" is not a regular file.`);
    }
    await copyFile(sourcePath, join(outputPath, filename));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  buildSite().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
