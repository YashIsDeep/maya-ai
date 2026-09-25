// M0-00 smoke check: SMOKE.md holds exactly the owner's sentence (docs/DECISIONS.md, 2026-09-26).
import { readFileSync } from "node:fs";

const expected = "This file proves that one trivial change travelled through every Maya Build stage, from Plan to Merge.";
const actual = readFileSync(new URL("./SMOKE.md", import.meta.url), "utf8").replace(/\r?\n$/, "");

if (actual !== expected) {
  console.error(`SMOKE.md does not hold the owner's sentence.\n  expected: ${expected}\n  actual:   ${actual}`);
  process.exit(1);
}
console.log("SMOKE.md holds the owner's sentence.");
