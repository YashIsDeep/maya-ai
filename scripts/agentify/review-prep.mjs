// Prepares .agentify/review/ in the task worktree for the read-only Opus reviewer, which can read
// files but cannot run git or tests. Run by the "Prepare review" shell action (Review stage).
// Never fails on a red check: the reviewer reports it, and the owner decides at the gate.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const worktree = process.env.WM_WORKTREE || process.cwd();
const base = process.env.WM_BASE_BRANCH || "main";
const out = join(worktree, ".agentify", "review");
mkdirSync(out, { recursive: true });

const git = (...args) =>
  execFileSync("git", args, { cwd: worktree, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

const mergeBase = git("merge-base", base, "HEAD").trim();
const uncommitted = git("status", "--porcelain", "--untracked-files=all").trim();

writeFileSync(join(out, "commits.txt"), git("log", "--format=%h %s", `${mergeBase}..HEAD`) || "(no commits)\n");
writeFileSync(join(out, "diffstat.txt"), git("diff", "--stat", mergeBase, "HEAD") || "(empty diff)\n");
writeFileSync(join(out, "diff.patch"), git("diff", mergeBase, "HEAD"));
writeFileSync(join(out, "uncommitted.txt"), uncommitted ? `${uncommitted}\n` : "(clean)\n");

let checks = "none";
const checkScript = join(worktree, "scripts", "check.mjs");
if (existsSync(checkScript)) {
  const run = spawnSync(process.execPath, [checkScript], {
    cwd: worktree,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 30 * 60 * 1000,
  });
  checks = run.status === 0 ? "pass" : "fail";
  writeFileSync(
    join(out, "checks.txt"),
    `result: ${checks} (exit ${run.status ?? run.signal})\n\n${run.stdout ?? ""}\n${run.stderr ?? ""}${run.error ? `\n${run.error}` : ""}`,
  );
} else {
  writeFileSync(join(out, "checks.txt"), "result: none (scripts/check.mjs is missing)\n");
}

console.log(`base ${base} @ ${mergeBase.slice(0, 10)} · checks ${checks} · uncommitted ${uncommitted ? "yes" : "no"}`);
if (process.env.WM_OUTPUT_FILE) {
  writeFileSync(process.env.WM_OUTPUT_FILE, JSON.stringify({ checks, uncommitted: uncommitted ? "yes" : "no" }));
}
