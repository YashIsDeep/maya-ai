// Every automated check this repository has, run by the Review and Merge stages and by
// implementers before they finish. Exit code 0 when every check passes.
//
// Checks are discovered, not listed here, so parallel tasks never edit the same file: a package
// registers its checks in a `maya.checks.json` at its root, e.g.
//   [{ "name": "coordinator tests", "command": "npm test" }, { "name": "typecheck", "command": "npx tsc --noEmit" }]
// Commands run through the shell with that package directory as the working directory.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set([".git", ".agentify", "node_modules", ".dart_tool", "build", "dist", "coverage"]);

/** Registration files at most three levels down (root, packages/x, apps/x/y). */
function find(dir, depth = 0, found = []) {
  if (existsSync(join(dir, "maya.checks.json"))) found.push(join(dir, "maya.checks.json"));
  if (depth < 3) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !SKIP.has(entry.name) && !entry.name.startsWith(".")) find(join(dir, entry.name), depth + 1, found);
    }
  }
  return found;
}

const checks = find(root).flatMap((file) =>
  JSON.parse(readFileSync(file, "utf8")).map((check) => ({ ...check, cwd: dirname(file) })),
);

if (checks.length === 0) {
  console.log("No checks registered yet (no maya.checks.json found).");
  process.exit(0);
}

let failed = 0;
for (const check of checks) {
  console.log(`\n=== ${check.name} (${relative(root, check.cwd) || "."}): ${check.command}`);
  const run = spawnSync(check.command, { cwd: check.cwd, shell: true, stdio: "inherit" });
  if (run.status !== 0) {
    failed++;
    console.log(`--- FAILED: ${check.name} (exit ${run.status ?? run.signal})`);
  }
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed.`);
process.exit(failed ? 1 : 0);
