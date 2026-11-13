
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

const projectRoot = path.resolve(currentDirectory, "..");

const sourceDirectory = path.join(
  projectRoot,
  "node_modules",
  "@vladmandic",
  "face-api",
  "model"
);

const destinationDirectory = path.join(
  projectRoot,
  "public",
  "models"
);

if (!fs.existsSync(sourceDirectory)) {
  throw new Error(
    "Face API model directory not found. Run npm install first."
  );
}

fs.mkdirSync(destinationDirectory, { recursive: true });

const files = fs.readdirSync(sourceDirectory);

let copied = 0;

for (const file of files) {
  const sourcePath = path.join(sourceDirectory, file);
  const destinationPath = path.join(destinationDirectory, file);

  if (fs.statSync(sourcePath).isFile()) {
    fs.copyFileSync(sourcePath, destinationPath);
    copied++;
  }
}

if (copied === 0) {
  throw new Error("No model files were found to copy.");
}

console.log(`Copied ${copied} face-api model files.`);
console.log(`Destination: ${destinationDirectory}`);
