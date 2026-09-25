// Every automated check this repository has, run by the Review stage and by implementers before
// they finish. When you add a package with tests, lint or typecheck, register its command here.
// Exit code: 0 when every check passes.
import { spawnSync } from "node:child_process";

/** @type {{ name: string, command: string, cwd?: string }[]} */
const checks = [
  // { name: "coordinator tests", command: "npm test", cwd: "coordinator" },
];

if (checks.length === 0) {
  console.log("No checks registered yet.");
  process.exit(0);
}

let failed = 0;
for (const check of checks) {
  console.log(`\n=== ${check.name}: ${check.command}`);
  const run = spawnSync(check.command, { cwd: check.cwd, shell: true, stdio: "inherit" });
  if (run.status !== 0) {
    failed++;
    console.log(`--- FAILED: ${check.name} (exit ${run.status ?? run.signal})`);
  }
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed.`);
process.exit(failed ? 1 : 0);
