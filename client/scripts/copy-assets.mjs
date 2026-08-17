import { copyFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sourceDir = join(__dirname, "..", "..", "assets");
const targetDir = join(__dirname, "..", "public", "assets");

mkdirSync(targetDir, { recursive: true });

const files = [
  ["Logo_01.png", "logo-full.png"],
  ["Logo_brancagr.png", "logo-mark.png"],
  ["fav_icon_64x64.png", "favicon.png"],
];

for (const [source, target] of files) {
  copyFileSync(join(sourceDir, source), join(targetDir, target));
}

console.log("Logos copiados para client/public/assets");
