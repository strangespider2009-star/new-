import { cp, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const source = join(projectRoot, "node_modules", "@vladmandic", "face-api", "model");
const destination = join(projectRoot, "public", "models");

await mkdir(destination, { recursive: true });
let entries;
try {
  entries = await readdir(source, { withFileTypes: true });
} catch {
  throw new Error("Face model directory was not found. Run npm install before npm run build.");
}

for (const entry of entries) {
  await cp(join(source, entry.name), join(destination, entry.name), { recursive: true, force: true });
}
console.log("Copied " + entries.length + " face model files into public/models.");
