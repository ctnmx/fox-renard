// Fails when the built Widget exceeds its size budget, gzipped.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const budget = 25 * 1000;
const script = new URL("../dist/widget.js", import.meta.url);
const size = gzipSync(readFileSync(script), { level: 9 }).length;

console.log(`widget.js: ${size} bytes gzipped (budget ${budget})`);
if (size > budget) {
  console.error(`widget.js is ${size - budget} bytes over its budget.`);
  process.exit(1);
}
