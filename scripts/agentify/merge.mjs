// Lands an approved task branch on its base branch. Run by the "Merge into main" shell action
// (Merge stage) from the main checkout, after the owner approved the code review.
//
// 1. merges the latest base into the task branch, in the task worktree;
// 2. runs scripts/check.mjs there, so parallel tasks that merged meanwhile are checked together;
// 3. fast-forwards the base branch in the main checkout to the result.
// Refuses rather than guesses: any unclean state fails the action with the reason.
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const { WM_REPO: repo, WM_BRANCH: branch, WM_WORKTREE: worktree } = process.env;
const base = process.env.WM_BASE_BRANCH || "main";

const fail = (message) => {
  console.error(message);
  process.exit(1);
};
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

if (!repo || !branch || !worktree) fail("WM_REPO, WM_BRANCH and WM_WORKTREE must be set; this runs from the Agentify Merge stage.");
if (git(worktree, "status", "--porcelain")) {
  fail("The task worktree has uncommitted changes. Add a Rework note and drag the task back to Implement so they are committed.");
}
const current = git(repo, "rev-parse", "--abbrev-ref", "HEAD");
if (current !== base) fail(`The main checkout ${repo} is on '${current}', not '${base}'. Switch it back, then Retry.`);
if (git(repo, "status", "--porcelain", "--untracked-files=no")) {
  fail(`The main checkout ${repo} has uncommitted changes to tracked files. Commit or stash them, then Retry.`);
}

const merge = spawnSync("git", ["merge", "--no-edit", base], { cwd: worktree, encoding: "utf8" });
process.stdout.write(merge.stdout ?? "");
if (merge.status !== 0) {
  spawnSync("git", ["merge", "--abort"], { cwd: worktree });
  fail(
    `Merging ${base} into ${branch} conflicted and was aborted:\n${merge.stderr}${merge.stdout}\n` +
      'Add a Rework note ("merge conflict with main") to the task description and drag it back to Implement.',
  );
}

// main's copy of the runner, pointed at the worktree (see review-prep.mjs).
const checkScript = fileURLToPath(new URL("../check.mjs", import.meta.url));
const checks = spawnSync(process.execPath, [checkScript, worktree], { cwd: worktree, stdio: "inherit" });
if (checks.status !== 0) {
  fail(`Checks fail on ${branch} with the latest ${base} merged in. Add a Rework note and drag the task back to Implement.`);
}

const ff = spawnSync("git", ["merge", "--ff-only", branch], { cwd: repo, encoding: "utf8" });
process.stdout.write(ff.stdout ?? "");
if (ff.status !== 0) fail(`Fast-forwarding ${base} to ${branch} failed (did ${base} move meanwhile? Retry):\n${ff.stderr}`);
console.log(`${base} is now ${git(repo, "rev-parse", "--short", "HEAD")} (${branch})`);
