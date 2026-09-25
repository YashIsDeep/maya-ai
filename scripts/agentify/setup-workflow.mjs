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

const prompts = {
  plan: `You are the PLANNER for one Maya task: Claude Opus 5.5, read-only, fresh session.
Before anything else, read ${PROCESS_DOC} in this repository and follow §3 and §6.1. That document overrides anything else here.

${TASK}

${NOTE}

Previous plan (empty on the first attempt; reuse its Decisions — never re-ask what the owner already answered):
{{artifacts["plan.md"]}}

Previous plan review (empty on the first attempt; it may be an APPROVE from an earlier round — the task description's Rework note, if any, says why the task came back):
{{artifacts["plan-review.md"]}}

Settle every owner decision through the ask_user tool before you write. Then reply with only the plan document in the §6.1 format.`,

  planReview: `You are the PLAN REVIEWER for one Maya task: Claude Opus 5.5, read-only, fresh session. You did not write this plan.
Before anything else, read ${PROCESS_DOC} in this repository and follow §3 and §6.2. That document overrides anything else here.

${TASK}

${NOTE}

Plan under review:
{{artifacts["plan.md"]}}

Your previous review of an earlier version (empty on the first attempt; verify each of its blocking issues is resolved):
{{artifacts["plan-review.md"]}}

Reply with only the review document in the §6.2 format.`,

  implement: `You are the IMPLEMENTER for one Maya task: Codex GPT-6 Luna, max effort, autonomous in this worktree, fresh session.
Before anything else, read AGENTS.md and ${PROCESS_DOC} in this repository and follow §3 and §6.3. That document overrides anything else here. Questions go to the owner only through the ask_user tool.

${TASK}

Approved plan (your specification):
{{artifacts["plan.md"]}}

Latest code review of this branch (empty on the first round; if present, fix every blocking finding and nothing unrelated):
{{artifacts["review.md"]}}

${NOTE}`,

  codeReview: `You are the CODE REVIEWER for one Maya task: Claude Opus 5.5, read-only, fresh session. You did not write this code.
Before anything else, read ${PROCESS_DOC} in this repository and follow §3 and §6.4. That document overrides anything else here.

${TASK}

${NOTE}

Approved plan:
{{artifacts["plan.md"]}}

Implementer's summary (what it says it did and assumed; verify, don't trust):
{{artifacts["implementation.md"]}}

Previous code review (empty on the first round; verify each of its blocking findings is resolved):
{{artifacts["review.md"]}}

Your review inputs are in .agentify/review/ in this worktree: diff.patch, diffstat.txt, commits.txt, checks.txt, uncommitted.txt. Read all of them, and any repository file you need. Reply with only the review document in the §6.4 format.`,
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
        { key: "plan", label: "Plan · Opus 5.5", actionType: "coding-agent", config: agent({
          prompt: prompts.plan, autonomy: "read-only", requireApproval: false, saveResultAs: "plan.md", inactivityTimeoutSec: 1800 }) },
        { key: "planReview", label: "Plan review · Opus 5.5 (fresh)", actionType: "coding-agent", config: agent({
          prompt: prompts.planReview, autonomy: "read-only", requireApproval: true, saveResultAs: "plan-review.md", inactivityTimeoutSec: 900,
          sendBackTo: "@Plan",
          approvalInstructions: "Artifacts: plan.md (the plan) and plan-review.md (a fresh Opus review of it).\n" +
            gate("GPT-6 Luna implements this plan.", "back to Plan; a fresh Opus planner redoes it with this review and your note.") }) },
        next("planNext"),
      ],
    },
    {
      name: "Implement", defaults: LUNA, actions: [
        { key: "implementWorktree", label: "Ensure worktree", actionType: "ensure-worktree", config: { branchPrefix: "wm/", carryOver: ".env" } },
        { key: "implement", label: "Implement · GPT-6 Luna max", actionType: "coding-agent", config: agent({
          prompt: prompts.implement, autonomy: "autonomous", requireApproval: false, saveResultAs: "implementation.md", inactivityTimeoutSec: 1800 }) },
        next("implementNext"),
      ],
    },
    {
      name: "Review", defaults: OPUS, actions: [
        { key: "prepareReview", label: "Prepare review (diff + checks)", actionType: "shell",
          config: { command: "node scripts/agentify/review-prep.mjs", cwd: "repo", shell: "default" } },
        { key: "codeReview", label: "Code review · Opus 5.5 (fresh)", actionType: "coding-agent", config: agent({
          prompt: prompts.codeReview, autonomy: "read-only", requireApproval: true, saveResultAs: "review.md", inactivityTimeoutSec: 900,
          sendBackTo: "@Implement",
          approvalInstructions: "Artifacts: review.md (a fresh Opus review) and implementation.md (the implementer's summary); the diff is in the drawer.\n" +
            gate("the branch merges into main (after merging main in and re-running checks).", "back to Implement; a fresh GPT-6 Luna implementer fixes the findings and your note.") }) },
        next("reviewNext"),
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
  description: "Maya: Opus 5.5 plans → fresh Opus plan review (you approve) → GPT-6 Luna max implements → fresh Opus code review (you approve) → merge. Process: C:\\code\\maya\\docs\\AGENTIFY_PROCESS.md",
  stages,
};
if (dryRun) {
  console.log(JSON.stringify(doc, null, 2));
} else {
  await call("PUT", `/workflows/${live.id}`, doc);
  console.log(`${NAME} (${live.id}) saved: ${stages.map((s) => `${s.name}[${s.bindings.length}]`).join(" → ")}`);
}
