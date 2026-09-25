// Merges an approved task branch into its base branch in the main checkout. Run by the
// "Merge into main" shell action (Merge stage), after the owner approved the code review.
// Refuses rather than guesses: any unclean state fails the action with the reason.
import { execFileSync, spawnSync } from "node:child_process";

const { WM_REPO: repo, WM_BRANCH: branch, WM_BASE_BRANCH: base = "main", WM_WORKTREE: worktree, WM_TASK_TITLE: title = "" } =
  process.env;

const fail = (message) => {
  console.error(message);
  process.exit(1);
};
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

if (!repo || !branch) fail("WM_REPO and WM_BRANCH must be set; this runs from the Agentify Merge stage.");
if (worktree && git(worktree, "status", "--porcelain")) {
  fail("The task worktree has uncommitted changes. Move the task back to Implement so they are committed.");
}
const current = git(repo, "rev-parse", "--abbrev-ref", "HEAD");
if (current !== base) fail(`The main checkout ${repo} is on '${current}', not '${base}'. Switch it back, then Retry.`);
if (git(repo, "status", "--porcelain", "--untracked-files=no")) {
  fail(`The main checkout ${repo} has uncommitted changes to tracked files. Commit or stash them, then Retry.`);
}

const merge = spawnSync("git", ["merge", "--no-ff", "-m", `Merge ${branch}: ${title}`, branch], { cwd: repo, encoding: "utf8" });
process.stdout.write(merge.stdout ?? "");
if (merge.status !== 0) {
  spawnSync("git", ["merge", "--abort"], { cwd: repo });
  fail(
    `Merge of ${branch} into ${base} failed and was aborted:\n${merge.stderr}\n` +
      "Move the task back to Implement with the note \"merge conflict with main\"; the implementer merges main into the branch first.",
  );
}
console.log(`Merged ${branch} into ${base}: ${git(repo, "rev-parse", "--short", "HEAD")}`);
