import { rmSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(projectRoot, ".output");

if (basename(outputDirectory) !== ".output" || dirname(outputDirectory) !== projectRoot) {
  throw new Error(`Refusing to clean unexpected output path: ${outputDirectory}`);
}

rmSync(outputDirectory, { recursive: true, force: true });
