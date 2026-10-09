// The Maya Build workflow, as code. This file is the source of truth for its stages, actions,
// prompts and stage defaults (docs/AGENTIFY_PROCESS.md §5, §8). Apply it with
//   node scripts/agentify/setup-workflow.mjs            (creates or updates "Maya Build")
//   node scripts/agentify/setup-workflow.mjs --dry-run  (prints the document, changes nothing)
// Re-applying is safe: stages are matched by name and actions by key, so their ids — and the tasks
// standing in them — are kept.
import { randomUUID } from "node:crypto";

const API = process.env.AGENTIFY_API ?? "http://127.0.0.1:2712/api";
const headers = { Origin: new URL(API).origin, "Content-Type": "application/json" };
const NAME = "Maya Build";
const PROCESS_DOC = "docs/AGENTIFY_PROCESS.md";

// Pinned ids, not aliases, so a CLI or alias change fails loudly instead of changing the model.
const OPUS = { agent: "claude", model: "claude-opus-5-5", effort: "high" };
const LUNA = { agent: "codex", model: "gpt-6-luna", effort: "max" };
const NONE = { agent: null, model: null, effort: null };

const TASK = "Task: {{task.title}}\n\n{{task.description}}";
const NOTE = `Owner note from the last Send back (empty if none; authoritative — it overrides the plan where they differ):
{{task.lastFeedback}}`;

const LOOP_RULES = `Owner-authorized loop update (27 September 2026): the enclosing Agentify phase instructions control your role and output format. They override the older manual review/report and fresh-session-only rules in docs/AGENTIFY_PROCESS.md. Keep its product, security, scope and owner-decision rules. Internal reviewers return the structured verdict requested by Agentify, not a Markdown review report. Apply review corrections automatically; only the final work goes to the owner. Never infer a product decision from reviewer feedback.`;

const prompts = {
  plan: `You are the PLANNER for one Maya task: Claude Opus 5.5, read-only, fresh session.
Before anything else, read ${PROCESS_DOC} in this repository and follow §3 and §6.1. ${LOOP_RULES}

${TASK}

${NOTE}

Previous plan (empty on the first attempt; reuse its Decisions — never re-ask what the owner already answered):
{{artifacts["plan.md"]}}

Settle every owner decision through the ask_user tool before you write. Then reply with only the plan document in the §6.1 format.`,

  planReview: `You are the PLAN REVIEWER for one Maya task: Claude Opus 5.5, read-only, fresh session. You did not write this plan.
Before anything else, read ${PROCESS_DOC} in this repository and follow §3 and §6.2. ${LOOP_RULES}

${TASK}

${NOTE}

Plan under review:
{{artifacts["plan.md"]}}

Your previous review of an earlier version (empty on the first attempt; verify each of its blocking issues is resolved):
{{artifacts["plan-review.md"]}}

Reply with only the review document in the §6.2 format.`,

  implement: `You are the IMPLEMENTER for one Maya task: Codex GPT-6 Luna, max effort, autonomous in this worktree, fresh session.
Before anything else, read AGENTS.md and ${PROCESS_DOC} in this repository and follow §3 and §6.3. ${LOOP_RULES} Questions go to the owner only through the ask_user tool.

${TASK}

Approved plan (your specification):
{{artifacts["plan.md"]}}

${NOTE}`,

  codeReview: `You are the CODE REVIEWER AND FIXER for one Maya task: Claude Opus 5.5, autonomous in this worktree, initially a fresh session. Review the implementation made by GPT-6 Luna.
Before anything else, read ${PROCESS_DOC} in this repository and follow §3 and §6.4. ${LOOP_RULES}

${TASK}

${NOTE}

Approved plan:
{{artifacts["plan.md"]}}

Implementer's summary (what it says it did and assumed; verify, don't trust):
{{artifacts["implementation.md"]}}

Your review inputs are in .agentify/review/ in this worktree: diff.patch, diffstat.txt, commits.txt, checks.txt, uncommitted.txt. Read all of them, and inspect the live diff and files again after fixes; prepared evidence can become stale. Fix blocking findings directly, run node scripts/check.mjs, and commit the focused corrections. Do not push or merge. Return a summary of the final implementation, corrections and validation, not a review verdict document. The enclosing independent-review phase, if present, takes precedence over this author prompt.`,
};

const gate = (approveMeans, sendBackMeans) =>
  `Read the artifacts named above (verdict first).
• Approve: ${approveMeans}
• Send back with a note: ${sendBackMeans}
• If you disagree with the review, Approve anyway (your call is final) or Send back.
• Do not use Request revision on Maya: it resumes this reviewer's session instead of starting a fresh one (docs/AGENTIFY_PROCESS.md §3.3).`;

// The review and merge scripts run from the main checkout (cwd "repo"), so a task branch cannot
// change the evidence its own reviewer sees or the way it is merged. They find the task through WM_*.

/** The workflow document, with stable keys; ids are filled in from the live workflow. */
function definition() {
  const agent = (config) => ({ agent: "", model: "", effort: "", continueSession: false, ...config });
  const next = (key) => ({ key, label: "Move to next stage", actionType: "move-stage", config: { target: "next" } });
  return [
    { name: "Backlog", defaults: NONE, actions: [] },
    {
      name: "Plan", defaults: OPUS, actions: [
        { key: "planWorktree", label: "Ensure worktree", actionType: "ensure-worktree", config: { branchPrefix: "wm/", carryOver: ".env" } },
        { key: "plan", label: "Plan loop · Opus 5.5", actionType: "coding-agent", config: agent({
          prompt: prompts.plan, loopMode: "plan", maxCorrections: 3, autonomy: "read-only", requireApproval: true, saveResultAs: "plan.md", inactivityTimeoutSec: 1800, sendBackTo: "@Plan", approvalInstructions: "Review the final plan.md after independent review and automatic corrections. Request revision updates the plan and reviews it again. Approve starts GPT-6 Luna implementation." }) },
        next("planNext"),
      ],
    },
    {
      name: "Implement", defaults: LUNA, actions: [
        { key: "implementWorktree", label: "Ensure worktree", actionType: "ensure-worktree", config: { branchPrefix: "wm/", carryOver: ".env" } },
        { key: "implement", label: "Implement · GPT-6 Luna max", actionType: "coding-agent", config: agent({
          prompt: prompts.implement, loopMode: "auto", reviewBeforeApproval: false, autonomy: "autonomous", requireApproval: false, saveResultAs: "implementation.md", inactivityTimeoutSec: 1800 }) },
        next("implementNext"),
      ],
    },
    {
      name: "Review", defaults: OPUS, actions: [
        { key: "prepareReview", label: "Prepare review (diff + checks)", actionType: "shell",
          config: { command: "node scripts/agentify/review-prep.mjs", cwd: "repo", shell: "default" } },
        { key: "codeReview", label: "Implement loop · Opus 5.5 review and fix", actionType: "coding-agent", config: agent({
          prompt: prompts.codeReview, loopMode: "implementation", maxCorrections: 3, autonomy: "autonomous", requireApproval: true, saveResultAs: "implementation.md", inactivityTimeoutSec: 1800,
          sendBackTo: "@Implement",
          approvalInstructions: "Review the final implementation.md and live diff after Opus has corrected and reviewed the implementation. Request revision applies and reviews further changes. Approve starts the CI loop, not Merge." }) },
        next("reviewNext"),
      ],
    },
    {
      name: "CI", defaults: LUNA, actions: [
        { key: "ciLoop", label: "CI loop · GPT-6 Luna max", actionType: "coding-agent", config: agent({
          loopMode: "ci", maxCorrections: 3, autonomy: "autonomous", requireApproval: true,
          prompt: LOOP_RULES + "\n\nFix failing registered Maya checks within the approved scope. Preserve tests and product decisions. Commit focused corrections after validation. Do not push or merge.\n\n" + TASK + "\n\nApproved plan:\n{{artifacts[\"plan.md\"]}}\n\n" + NOTE,
          ciCheckCommand: 'node "C:/code/maya/scripts/check.mjs" .', ciShell: "default", ciTimeoutSec: 1800,
          ciPublishCommand: "", saveResultAs: "ci.md", inactivityTimeoutSec: 1800, sendBackTo: "@Implement",
          approvalInstructions: "Review the final changes and ci.md after the registered checks pass. Remote PR checks are not configured in this checkout. Approve allows the existing Merge stage to merge into main." }) },
        next("ciNext"),
      ],
    },
    {
      name: "Merge", defaults: NONE, actions: [
        { key: "mergeMain", label: "Merge into main", actionType: "shell", config: { command: "node scripts/agentify/merge.mjs", cwd: "repo", shell: "default" } },
        next("mergeNext"),
      ],
    },
    { name: "Done", defaults: NONE, actions: [] },
  ];
}

async function call(method, path, body) {
  const res = await fetch(API + path, { method, headers, body: body && JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

const dryRun = process.argv.includes("--dry-run");
let live = (await call("GET", "/workflows")).find((w) => w.name === NAME);
if (!live && !dryRun) live = await call("GET", `/workflows/${(await call("POST", "/workflows", { name: NAME })).id}`);
live ??= { name: NAME, stages: [] };

const liveStages = new Map(live.stages.map((s) => [s.name, s]));
const stageId = new Map(definition().map((s) => [s.name, liveStages.get(s.name)?.id ?? randomUUID()]));
const resolveRefs = (config) =>
  Object.fromEntries(Object.entries(config).map(([k, v]) => [k, typeof v === "string" && v.startsWith("@") ? stageId.get(v.slice(1)) : v]));

const stages = definition().map((s, position) => {
  const id = stageId.get(s.name);
  const liveBindings = new Map((liveStages.get(s.name)?.bindings ?? []).map((b) => [b.key, b]));
  return {
    id, name: s.name, position, wipLimit: null, agentDefaults: s.defaults,
    bindings: s.actions.map((a, i) => ({
      id: liveBindings.get(a.key)?.id ?? randomUUID(), stageId: id, key: a.key, label: a.label, actionType: a.actionType,
      config: resolveRefs(a.config), enabled: true, continueOnFailure: false, position: i,
    })),
  };
});
const dropped = live.stages.filter((s) => !stageId.has(s.name)).map((s) => s.name);
if (dropped.length) console.warn(`Stages not in this definition will be deleted: ${dropped.join(", ")}`);

const doc = {
  ...live,
  description: "Maya: Opus plan loop → plan approval → Luna implementation → Opus review/fix loop → implementation approval → CI loop → final approval → merge. Process: C:\\code\\maya\\docs\\AGENTIFY_PROCESS.md",
  stages,
};
if (dryRun) {
  console.log(JSON.stringify(doc, null, 2));
} else {
  await call("PUT", `/workflows/${live.id}`, doc);
  console.log(`${NAME} (${live.id}) saved: ${stages.map((s) => `${s.name}[${s.bindings.length}]`).join(" → ")}`);
}
