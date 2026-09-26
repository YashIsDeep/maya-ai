// One-task Maya Build tick. Run from the main Maya checkout:
//   node scripts/agentify/tick.mjs claim [--holder <label>]
//   node scripts/agentify/tick.mjs watch --task <id> --token <token> [--max-seconds 540] [--seen <fingerprint>]
//   node scripts/agentify/tick.mjs release --task <id> --token <token>
//   node scripts/agentify/tick.mjs status | candidates
import { randomBytes } from "node:crypto";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  cleanupLocks,
  heartbeat,
  leaseIsLive,
  listLeases,
  readLease,
  release as releaseLease,
  tryAcquire,
  validateHolder,
  validateTaskId,
  validateToken,
  withLock,
} from "./claims.mjs";

const WORKFLOW_NAME = "Maya Build";
const STAGE_NAMES = ["Backlog", "Plan", "Implement", "Review", "Merge", "Done"];
const ACTIVE_NAMES = new Set(["Plan", "Implement", "Review"]);
const LIMIT = 3;
const REQUEST_TIMEOUT_MS = 20_000;
const API = () => process.env.AGENTIFY_API ?? "http://127.0.0.1:2712/api";

function origin() {
  return new URL(API()).origin;
}

async function apiRequest(method, path, body) {
  const headers = { Origin: origin() };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await fetch(`${API()}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    const error = new Error(`${method} ${path} could not reach Agentify: ${cause.message}`, { cause });
    error.agentifyDown = true;
    throw error;
  }
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`${method} ${path} returned ${response.status}${text ? `: ${text}` : ""}`);
    error.status = response.status;
    throw error;
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// Agentify adapter: API field names and transport stay in this section. The live source/API uses
// currentStageId, millisecond timestamps, status=active|archived list filters, and visit-local runs.
export async function listWorkflows() {
  return apiRequest("GET", "/workflows");
}

export async function listTasks() {
  const [active, archived] = await Promise.all([
    apiRequest("GET", "/tasks?status=active"),
    apiRequest("GET", "/tasks?status=archived"),
  ]);
  return [...active, ...archived];
}

export function isArchived(task) {
  return Boolean(task.archivedAt ?? task.archived) || task.status === "archived";
}

export function taskIdOf(task) {
  return task.id;
}

export function titleOf(task) {
  return task.title ?? "(untitled task)";
}

export function descriptionOf(task) {
  return task.description ?? "";
}

export function statusOf(task) {
  return task.status;
}

export function stageIdOf(task) {
  return task.currentStageId ?? task.stageId ?? null;
}

export function createdAtOf(task) {
  const value = task.createdAt;
  if (typeof value === "number") return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

export function tagsOf(task) {
  return Array.isArray(task.tags) ? task.tags : [];
}

export function workflowIdOf(task) {
  return task.workflowId;
}

export async function getTask(id) {
  try {
    return await apiRequest("GET", `/tasks/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

export function taskFromDetail(detail) {
  return detail?.task ?? null;
}

export function visitRuns(detail) {
  const task = taskFromDetail(detail);
  if (!task?.currentVisitId) return [];
  return detail.visits?.find((visit) => visit.id === task.currentVisitId)?.runs ?? [];
}

export function runIdOf(run) {
  return run.id;
}

export function rawRunStatusOf(run) {
  return run.status;
}

export function runState(run) {
  switch (rawRunStatusOf(run)) {
    case "waiting": return "slot-wait";
    case "queued": return "queued";
    case "running": return "running";
    case "awaiting-approval": return "approval";
    case "quota-wait": return "quota";
    case "failed": return "failed";
    case "interrupted": return "interrupted";
    case "succeeded": return "succeeded";
    case "skipped": return "skipped";
    case "cancelled": return "cancelled";
    case "sent-back": return "sent-back";
    default: return "unknown";
  }
}

export function runLabel(run) {
  return run.label ?? "(unnamed action)";
}

export function runError(run) {
  return run.error == null ? "" : String(run.error);
}

export function resumeAtOf(run) {
  return run.resumeAt ?? null;
}

export function retryOfOf(run) {
  return run.retryOfRunId ?? null;
}

export function gateArtifactOf(run) {
  return run.config?.saveResultAs ?? null;
}

export function actionKeyOf(run) {
  return run.bindingKey ?? "";
}

export function pendingQuestions(detail) {
  const questions = [];
  for (const run of visitRuns(detail)) {
    const question = run.question;
    if (!question) continue;
    const prompts = (question.fields ?? []).map((field) => field.text).filter((text) => typeof text === "string" && text);
    const text = [question.preamble, ...prompts].filter((part) => typeof part === "string" && part).join("\n");
    questions.push({ id: question.id ?? `${run.id}`, runId: run.id, text });
  }
  return questions;
}

export function isInactivityTimeout(run) {
  return /inactivit/i.test(runError(run));
}

export function eventMentions(data, taskId) {
  return data.includes(taskId);
}

export async function setTags(id, tags) {
  return apiRequest("PATCH", `/tasks/${encodeURIComponent(id)}`, { tags });
}

export async function startTask(id, planStageId) {
  return apiRequest("POST", `/tasks/${encodeURIComponent(id)}/move`, { stageId: planStageId, runActions: true });
}

export async function retryRun(runId) {
  return apiRequest("POST", `/runs/${encodeURIComponent(runId)}/retry`, {});
}

export async function getArtifact(id, name) {
  try {
    return await apiRequest("GET", `/tasks/${encodeURIComponent(id)}/artifact?name=${encodeURIComponent(name)}`);
  } catch {
    return null;
  }
}

// Workflow and stage field access belongs to this adapter section as well.
export function workflowName(workflow) {
  return workflow.name;
}

export function workflowId(workflow) {
  return workflow.id;
}

export function workflowStages(workflow) {
  return workflow.stages ?? [];
}

export function stageId(stage) {
  return stage.id;
}

export function stageName(stage) {
  return stage.name;
}

export function stagePosition(stage) {
  return Number(stage.position ?? 0);
}

export function taskTitleId(task) {
  return /^\[([^\]]+)\]/.exec(titleOf(task))?.[1] ?? null;
}

export function dependenciesOf(task) {
  const line = /^\*\*Depends on\.\*\*\s*(.*)$/m.exec(descriptionOf(task));
  if (!line) return { present: false, ids: [], saysNone: false, raw: "" };
  const raw = line[1].trim();
  const ids = raw.match(/[A-Z][A-Z0-9]*-\d+[a-z]?/g) ?? [];
  return { present: true, ids: [...new Set(ids)], saysNone: /^none$/i.test(raw), raw };
}

export function readiness(task, allTasks) {
  const dependencies = dependenciesOf(task);
  if (!dependencies.present) return { ready: false, reason: "Depends on line is missing." };
  if (!dependencies.ids.length) {
    return dependencies.saysNone
      ? { ready: true, reason: "No dependencies." }
      : { ready: false, reason: "Depends on line has no dependency IDs or 'none'." };
  }
  const completed = [];
  for (const id of dependencies.ids) {
    const dependency = allTasks.find((candidate) => taskTitleId(candidate) === id);
    if (!dependency) return { ready: false, reason: `Dependency ${id} is unknown.` };
    if (isArchived(dependency)) {
      completed.push(`${id}: archived`);
    } else if (stageNameByTask(dependency, allTasks) === "Done") {
      completed.push(`${id}: Done`);
    } else {
      return { ready: false, reason: `Dependency ${id} is not Done or archived.` };
    }
  }
  return { ready: true, reason: `Dependencies complete: ${completed.join(", ")}.` };
}

// Resolve a task's stage name without needing a workflow argument, using the stageName field from
// visit-shaped task fixtures when provided. Board operations use stageNameFor() below.
function stageNameByTask(task, allTasks) {
  const stages = allTasks.stagesById;
  return stages?.get(stageIdOf(task)) ?? null;
}

function requireBoard(workflows, tasks) {
  const workflow = workflows.find((item) => workflowName(item) === WORKFLOW_NAME);
  if (!workflow) throw new Error(`Maya Build workflow is missing. Run node scripts/agentify/setup-workflow.mjs from C:\\code\\maya.`);
  const stages = workflowStages(workflow);
  const byName = new Map(stages.map((stage) => [stageName(stage), stage]));
  const missing = STAGE_NAMES.filter((name) => !byName.has(name));
  if (missing.length) throw new Error(`Maya Build stages missing (${missing.join(", ")}). Run node scripts/agentify/setup-workflow.mjs from C:\\code\\maya.`);
  const byId = new Map(stages.map((stage) => [stageId(stage), stage]));
  const mayaTasks = tasks.filter((task) => workflowIdOf(task) === workflowId(workflow));
  const board = { workflow, stages, byName, byId, tasks: mayaTasks };
  board.tasks = dependenciesWithStages(board);
  return board;
}

async function loadBoard() {
  const [workflows, tasks] = await Promise.all([listWorkflows(), listTasks()]);
  return requireBoard(workflows, tasks);
}

async function reloadBoardTasks(board) {
  const tasks = await listTasks();
  return { ...board, tasks: tasks.filter((task) => workflowIdOf(task) === workflowId(board.workflow)) };
}

function stageNameFor(task, board) {
  return board.byId.get(stageIdOf(task)) ? stageName(board.byId.get(stageIdOf(task))) : null;
}

function isOpen(task, board) {
  return !isArchived(task) && stageNameFor(task, board) !== "Done";
}

function stagePositionFor(task, board) {
  const stage = board.byId.get(stageIdOf(task));
  return stage ? stagePosition(stage) : -1;
}

function leaseMap() {
  return new Map(listLeases().map((entry) => [entry.taskId, entry]));
}

function liveLeaseFor(leases, taskId) {
  const item = leases.get(taskId);
  if (!item) return false;
  return leaseIsLive(item, Date.now());
}

function cleanRankedTasks(board, leases) {
  const open = board.tasks.filter((task) => isOpen(task, board));
  const nonBacklogAll = open.filter((task) => stageNameFor(task, board) !== "Backlog");
  const nonBacklog = nonBacklogAll.filter((task) => !liveLeaseFor(leases, taskIdOf(task)));
  const backlogAll = open.filter((task) => stageNameFor(task, board) === "Backlog");
  const readyBacklogAll = backlogAll.filter((task) => readiness(task, board.tasksWithStages ?? board.tasks).ready);
  const backlog = readyBacklogAll.filter((task) => !liveLeaseFor(leases, taskIdOf(task)));
  const byAge = (a, b) => createdAtOf(a) - createdAtOf(b) || String(taskIdOf(a)).localeCompare(String(taskIdOf(b)));
  nonBacklog.sort((a, b) => stagePositionFor(b, board) - stagePositionFor(a, board) || byAge(a, b));
  backlog.sort(byAge);
  readyBacklogAll.sort(byAge);
  return { open, nonBacklogAll, nonBacklog, backlog, backlogAll, readyBacklogAll };
}

export function rankTasks(board, leases = new Map()) {
  const ranked = cleanRankedTasks(board, leases);
  return [...ranked.nonBacklog, ...ranked.backlog];
}

function dependenciesWithStages(board) {
  const list = [...board.tasks];
  Object.defineProperty(list, "stagesById", { value: new Map(board.stages.map((stage) => [stageId(stage), stageName(stage)])) });
  return list;
}

function taskStageIs(task, name, board) {
  return stageNameFor(task, board) === name;
}

function countsFor(board, leases, { starting = false } = {}) {
  const open = board.tasks.filter((task) => isOpen(task, board));
  const watched = board.tasks.filter((task) => liveLeaseFor(leases, taskIdOf(task))).length;
  const activeStages = open.filter((task) => ACTIVE_NAMES.has(stageNameFor(task, board))).length;
  const reservedBacklog = starting ? 0 : open.filter((task) => taskStageIs(task, "Backlog", board) && liveLeaseFor(leases, taskIdOf(task))).length;
  const backlogReady = open.filter((task) => taskStageIs(task, "Backlog", board) && readiness(task, dependenciesWithStages(board)).ready).length;
  return { open: open.length, watched, active: activeStages + reservedBacklog, activeStages, backlogReady };
}

async function cleanupStaleTags(board, warnings = []) {
  let cleaned = 0;
  for (const task of board.tasks) {
    if (!tagsOf(task).includes("watched")) continue;
    const lease = readLease(taskIdOf(task));
    if (leaseIsLive(lease)) continue;
    try {
      await setTags(taskIdOf(task), tagsOf(task).filter((tag) => tag !== "watched"));
      cleaned++;
    } catch (error) {
      warnings.push(`Could not remove stale watched tag from ${taskIdOf(task)}: ${error.message}`);
    }
  }
  return cleaned;
}

function timestampReason(task) {
  const created = createdAtOf(task);
  return Number.isFinite(created) ? new Date(created).toISOString() : "unknown time";
}

function claimReason(task, board, counts) {
  const stage = stageNameFor(task, board);
  if (stage !== "Backlog") return `Furthest along: ${stage} (created ${timestampReason(task)}).`;
  const result = readiness(task, dependenciesWithStages(board));
  return `Ready Backlog task (${result.reason}); ${counts.active} of ${LIMIT} active slots used.`;
}

async function attemptClaim(task, board, holder) {
  const stage = board.byId.get(stageIdOf(task));
  return tryAcquire({
    taskId: taskIdOf(task),
    title: titleOf(task),
    stageId: stageId(stage),
    stageName: stageName(stage),
    holder,
  });
}

function candidateCounts(board, leases) {
  return countsFor(board, leases);
}

function noneResult(code, counts, warnings = []) {
  const reasons = {
    "all-watched": "Every open candidate is already watched by another chat.",
    busy: "The start lock is busy; try again shortly.",
    limit: `The active-task limit is reached (${counts.active} of ${LIMIT} slots used).`,
    "nothing-ready": "Nothing is ready to claim.",
  };
  return {
    none: true,
    code,
    reason: reasons[code],
    counts: { open: counts.open, watched: counts.watched, active: counts.active, backlogReady: counts.backlogReady },
    ...(warnings.length ? { warnings } : {}),
  };
}

export async function claimTask({ holder = `chat-${randomBytes(4).toString("hex")}` } = {}) {
  validateHolder(holder);
  const board = await loadBoard();
  const leases = leaseMap();
  const warnings = [];
  await cleanupStaleTags(board, warnings);
  const ranked = cleanRankedTasks({ ...board, tasks: dependenciesWithStages(board) }, leases);
  let heldOrBusy = false;
  let attempted = false;
  let acquired;
  let picked;

  for (const task of ranked.nonBacklog) {
    attempted = true;
    const result = await attemptClaim(task, board, holder);
    if (result.status === "ok") { acquired = result; picked = task; break; }
    if (result.status === "held" || result.status === "busy") heldOrBusy = true;
  }

  let startBusy = false;
  let limitReached = false;
  let latestBoard = board;
  let latestLeases = leases;
  if (!acquired && ranked.readyBacklogAll.length) {
    const locked = await withLock("_start", async () => {
      latestBoard = await reloadBoardTasks(board);
      latestBoard.tasks = dependenciesWithStages(latestBoard);
      latestLeases = leaseMap();
      const freshCounts = countsFor(latestBoard, latestLeases);
      if (freshCounts.active >= LIMIT) {
        limitReached = true;
        return null;
      }
      const fresh = cleanRankedTasks(latestBoard, latestLeases).backlog;
      for (const task of fresh) {
        attempted = true;
        const result = await attemptClaim(task, latestBoard, holder);
        if (result.status === "ok") return { task, result };
        if (result.status === "held" || result.status === "busy") heldOrBusy = true;
      }
      return null;
    });
    if (locked.kind === "busy") startBusy = true;
    else if (locked.value) {
      picked = locked.value.task;
      acquired = locked.value.result;
    }
  }

  const finalBoard = latestBoard;
  const finalLeases = latestLeases;
  const counts = candidateCounts(finalBoard, finalLeases);
  if (acquired && picked) {
    try {
      await setTags(taskIdOf(picked), [...new Set([...tagsOf(picked), "watched"])]);
    } catch (error) {
      warnings.push(`Claim succeeded, but the watched tag could not be added: ${error.message}`);
    }
    return {
      taskId: taskIdOf(picked),
      title: titleOf(picked),
      stage: stageNameFor(picked, finalBoard),
      token: acquired.lease.token,
      holder,
      reason: claimReason(picked, finalBoard, counts),
      tookOver: Boolean(acquired.tookOver),
      warnings,
    };
  }

  const finalRanked = cleanRankedTasks({ ...finalBoard, tasks: dependenciesWithStages(finalBoard) }, finalLeases);
  const hasReadyBacklog = finalRanked.readyBacklogAll.length > 0;
  const watchedCandidate = finalRanked.nonBacklogAll.some((task) => liveLeaseFor(finalLeases, taskIdOf(task))) ||
    finalRanked.readyBacklogAll.some((task) => liveLeaseFor(finalLeases, taskIdOf(task)));
  const code = limitReached || (hasReadyBacklog && counts.active >= LIMIT)
    ? "limit"
    : startBusy
      ? "busy"
      : (attempted && heldOrBusy) || watchedCandidate
        ? "all-watched"
        : "nothing-ready";
  return noneResult(code, counts, warnings);
}

export async function releaseTask(taskId, token) {
  validateTaskId(taskId);
  validateToken(token);
  const current = readLease(taskId);
  if (!current.lease || current.lease.token !== token) return { released: false, reason: "not-held", warnings: [] };
  const warnings = [];
  try {
    const detail = await getTask(taskId);
    const task = taskFromDetail(detail);
    if (task) await setTags(taskId, tagsOf(task).filter((tag) => tag !== "watched"));
  } catch (error) {
    warnings.push(`Could not remove watched tag: ${error.message}`);
  }
  const result = await releaseLease(taskId, token);
  if (result.status === "ok") return { released: true, warnings };
  if (result.status === "busy") return { released: false, reason: "busy", warnings };
  return { released: false, reason: "not-held", warnings };
}

function leaseStatusView(entry, now = Date.now()) {
  const lease = entry.lease;
  const live = lease ? entry.kind === "live" || entry.kind === "busy" : entry.kind === "busy" || (entry.kind === "unreadable" && now - entry.mtimeMs <= 10 * 60_000);
  return {
    taskId: entry.taskId,
    title: lease?.title ?? null,
    stage: lease?.stageName ?? null,
    holder: lease?.holder ?? null,
    heartbeatAt: lease?.heartbeatAt ?? null,
    expiresAt: lease?.expiresAt ?? null,
    live,
  };
}

export async function status() {
  let leases = [];
  try {
    const board = await loadBoard();
    leases = listLeases();
    const warnings = [];
    await cleanupStaleTags(board, warnings);
    const locks = cleanupLocks();
    return { agentify: "up", leases: leases.map((entry) => leaseStatusView(entry)), cleaned: locks.cleaned, warnings };
  } catch (error) {
    if (!error.agentifyDown) throw error;
    try { leases = listLeases(); } catch { /* Keep status useful when the claims directory is unavailable too. */ }
    return { agentifyDown: true, error: error.message, leases: leases.map((entry) => leaseStatusView(entry)) };
  }
}

export async function candidates() {
  const board = await loadBoard();
  const tasks = dependenciesWithStages(board);
  const rankedBoard = { ...board, tasks };
  const leases = leaseMap();
  const ranked = cleanRankedTasks(rankedBoard, leases);
  const counts = countsFor(rankedBoard, leases);
  const stageRows = [...ranked.nonBacklog, ...ranked.backlog].map((task) => ({
    taskId: taskIdOf(task),
    title: titleOf(task),
    stage: stageNameFor(task, rankedBoard),
    createdAt: createdAtOf(task),
    reason: claimReason(task, rankedBoard, counts),
  }));
  const watched = [...leases.entries()].filter(([, entry]) => leaseIsLive(entry)).map(([taskId, entry]) => ({
    taskId,
    title: entry.lease?.title ?? null,
    holder: entry.lease?.holder ?? null,
    expiresAt: entry.lease?.expiresAt ?? null,
  }));
  const backlog = ranked.backlogAll.map((task) => {
    const result = readiness(task, tasks);
    return { taskId: taskIdOf(task), title: titleOf(task), ready: result.ready, reason: result.reason };
  });
  return { active: counts.active, limit: LIMIT, candidates: stageRows, watched, backlog };
}

function stageNameFromId(board, id) {
  const stage = board.byId.get(id);
  return stage ? stageName(stage) : null;
}

function verdictLine(text) {
  if (typeof text !== "string") return null;
  return /^\*\*Verdict:\*\*.*$/m.exec(text)?.[0] ?? null;
}

function stageGateArtifacts(name, run) {
  if (name === "Plan") return ["plan.md", "plan-review.md"];
  if (name === "Review") return ["review.md", "implementation.md", "the diff in the task drawer"];
  const artifact = gateArtifactOf(run);
  return artifact ? [artifact] : [];
}

function latestUnhandledFailure(runs) {
  const failures = runs.filter((run) => ["failed", "interrupted", "cancelled"].includes(runState(run)));
  return failures
    .filter((run) => {
      const id = runIdOf(run);
      const key = actionKeyOf(run);
      return !runs.some((other) => String(retryOfOf(other)) === String(id)) &&
        !runs.some((other) => Number(runIdOf(other)) > Number(id) && actionKeyOf(other) === key);
    })
    .sort((a, b) => Number(runIdOf(b)) - Number(runIdOf(a)))[0] ?? null;
}

function stateFor(status, extra = {}) {
  return { status, ...extra };
}

export function classifyVisit(detail, stage, { retried = [], noRunsForMs = 0, startGraceMs = 20_000, stageId: stageIdValue } = {}) {
  const runs = visitRuns(detail);
  const questions = pendingQuestions(detail);
  if (questions.length) {
    const sortedIds = questions.map((question) => question.id).sort();
    const run = runs.find((candidate) => questions.some((question) => question.runId === runIdOf(candidate)));
    const state = stateFor("needs-owner", { kind: "question", label: run ? runLabel(run) : "Agent question", questions });
    return { state, fingerprint: `question:${sortedIds.join(",")}` };
  }

  const approval = runs.find((run) => runState(run) === "approval");
  if (approval) {
    const artifactNames = stageGateArtifacts(stage, approval);
    const state = stateFor("needs-owner", {
      kind: "approval",
      label: runLabel(approval),
      runId: runIdOf(approval),
      artifacts: artifactNames,
      verdict: null,
    });
    return { state, fingerprint: `approval:${runIdOf(approval)}`, verdictArtifact: gateArtifactOf(approval) };
  }

  const quota = runs.find((run) => runState(run) === "quota");
  if (quota) {
    const resumeAt = resumeAtOf(quota);
    return { state: stateFor("quota", { label: runLabel(quota), resumeAt }), fingerprint: `quota:${runIdOf(quota)}:${resumeAt ?? ""}` };
  }

  const working = runs.some((run) => ["queued", "running", "slot-wait"].includes(runState(run)));
  if (working) return { state: stateFor("working"), fingerprint: "working" };

  const unknown = runs.find((run) => runState(run) === "unknown");
  if (unknown) {
    const rawStatus = rawRunStatusOf(unknown);
    return {
      state: stateFor("needs-owner", { kind: "unknown", label: runLabel(unknown), runId: runIdOf(unknown), rawStatus }),
      fingerprint: `unknown:${runIdOf(unknown)}:${rawStatus}`,
    };
  }

  const failure = latestUnhandledFailure(runs);
  if (failure) {
    const id = runIdOf(failure);
    if (retried.some((item) => String(item) === String(id))) return { state: stateFor("working"), fingerprint: "working" };
    const stateName = runState(failure);
    const error = runError(failure).slice(0, 500);
    if (retryOfOf(failure) == null && (stateName === "interrupted" || (stateName === "failed" && isInactivityTimeout(failure)))) {
      return { action: { type: "retry", runId: id, label: runLabel(failure), error } };
    }
    const kind = stage === "Merge" ? "merge-failure" : "failure";
    return {
      state: stateFor("needs-owner", { kind, label: runLabel(failure), runId: id, error }),
      fingerprint: `failure:${id}`,
    };
  }

  if (runs.length === 0) {
    if (noRunsForMs < startGraceMs) return { state: stateFor("working"), fingerprint: "working" };
    return { state: stateFor("needs-owner", { kind: "start" }), fingerprint: `start:${stageIdValue ?? stage}` };
  }

  return { state: stateFor("working"), fingerprint: "working" };
}

function envInterval(name, fallback, { allowZero = false } = {}) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < (allowZero ? 0 : 1)) return fallback;
  return value;
}

function common(taskId, title, stage, claimedAt) {
  return { taskId, title, stage, watchingFor: Math.max(0, Math.floor((Date.now() - Date.parse(claimedAt)) / 1000)) };
}

function commonResult(event, fields, context) {
  return { event, ...common(context.taskId, context.title, context.stage, context.claimedAt), ...fields };
}

function parseSseData(block) {
  return block.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).replace(/^ /, "")).join("\n");
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function readSseLoop(taskId, controller, notify) {
  while (!controller.signal.aborted) {
    try {
      const response = await fetch(`${API()}/events`, {
        headers: { Origin: origin(), Accept: "text/event-stream" },
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error(`SSE returned ${response.status}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          const data = parseSseData(block);
          if (data && eventMentions(data, taskId)) notify();
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return;
    }
    if (!controller.signal.aborted) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 5_000);
        controller.signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
      });
    }
  }
}

async function watchBacklog(taskId, token, board, detail, context) {
  const plan = board.byName.get("Plan");
  const locked = await withLock("_start", async () => {
    const fresh = await reloadBoardTasks(board);
    fresh.tasks = dependenciesWithStages(fresh);
    const task = fresh.tasks.find((item) => taskIdOf(item) === taskId);
    if (!task || isArchived(task)) return { result: commonResult("gone", {}, context) };
    if (stageNameFor(task, fresh) !== "Backlog") return { reevaluate: true };
    const ready = readiness(task, fresh.tasks);
    const leases = leaseMap();
    const counts = countsFor(fresh, leases, { starting: true });
    if (!ready.ready) return { result: commonResult("blocked", { reason: ready.reason }, context) };
    if (counts.activeStages >= LIMIT) return { result: commonResult("blocked", { reason: `${counts.activeStages} active tasks already use all ${LIMIT} slots.` }, context) };
    const beat = await heartbeat(taskId, token);
    if (beat.status === "lost") return { result: commonResult("lost", {}, context) };
    if (beat.status !== "ok") return { retry: true };
    try {
      await startTask(taskId, stageId(plan));
      return { result: commonResult("acted", { action: "started" }, context) };
    } catch (error) {
      return { result: commonResult("error", { error: error.message, after: "start" }, context) };
    }
  });
  if (locked.kind === "busy") return { retry: true, delayMs: 1_000 };
  return locked.value ?? { retry: true };
}

async function evaluateWatch(taskId, token, board, lease, context, startedAt, tagRepairAt) {
  const detail = await getTask(taskId);
  const task = taskFromDetail(detail);
  if (!detail || !task || isArchived(task)) return { result: commonResult("gone", {}, context), board, lease, tagRepairAt };

  const currentStageId = stageIdOf(task);
  const currentStage = stageNameFromId(board, currentStageId);
  if (currentStageId !== lease.stageId) {
    const fromPosition = board.byId.get(lease.stageId) ? stagePosition(board.byId.get(lease.stageId)) : -1;
    const toPosition = board.byId.get(currentStageId) ? stagePosition(board.byId.get(currentStageId)) : -1;
    const event = toPosition > fromPosition ? "advanced" : "moved-back";
    const extra = { from: lease.stageName, to: currentStage ?? "(unknown stage)" };
    if (lease.stageName === "Review") extra.verdict = verdictLine(await getArtifact(taskId, "review.md"));
    return { result: commonResult(event, extra, { ...context, title: titleOf(task) }), board, lease, tagRepairAt };
  }

  if (currentStage === "Backlog") {
    const started = await watchBacklog(taskId, token, board, detail, context);
    if (started.result) return { result: started.result, board, lease, tagRepairAt };
    if (started.retry) return { retry: true, delayMs: started.delayMs, board, lease, tagRepairAt };
    if (started.reevaluate) return { retry: true, delayMs: 0, board, lease, tagRepairAt };
  }

  const classification = classifyVisit(detail, currentStage, {
    retried: lease.retried ?? [],
    noRunsForMs: Date.now() - startedAt,
    startGraceMs: envInterval("MAYA_TICK_START_GRACE_MS", 20_000, { allowZero: true }),
    stageId: currentStageId,
  });
  if (classification.action?.type === "retry") {
    const beat = await heartbeat(taskId, token, { addRetried: classification.action.runId });
    if (beat.status === "lost") return { result: commonResult("lost", {}, context), board, lease, tagRepairAt };
    if (beat.status !== "ok") return { state: stateFor("working"), fingerprint: "working", board, lease, tagRepairAt };
    lease = beat.lease;
    try {
      await retryRun(classification.action.runId);
      return {
        result: commonResult("acted", {
          action: "retried",
          label: classification.action.label,
          runId: classification.action.runId,
          error: classification.action.error,
        }, context),
        board,
        lease,
        tagRepairAt,
      };
    } catch (error) {
      return { result: commonResult("error", { error: error.message, after: "retry" }, context), board, lease, tagRepairAt };
    }
  }

  if (classification.verdictArtifact) {
    const artifact = await getArtifact(taskId, classification.verdictArtifact);
    classification.state.verdict = verdictLine(artifact);
  }

  const now = Date.now();
  if (!tagsOf(task).includes("watched") && now - tagRepairAt >= 60_000) {
    tagRepairAt = now;
    try { await setTags(taskId, [...new Set([...tagsOf(task), "watched"])]); } catch { /* Retried at most once a minute. */ }
  }
  return { state: classification.state, fingerprint: classification.fingerprint, board, lease, tagRepairAt };
}

export async function watchTask({ taskId, token, maxSeconds = 540, seen } = {}) {
  validateTaskId(taskId);
  validateToken(token);
  if (!Number.isInteger(maxSeconds) || maxSeconds < 1 || maxSeconds > 550) throw new TypeError("--max-seconds must be an integer from 1 to 550");
  const initial = readLease(taskId);
  const lease = initial.lease;
  const context = {
    taskId,
    title: lease?.title ?? null,
    stage: lease?.stageName ?? null,
    claimedAt: lease?.claimedAt ?? new Date().toISOString(),
  };
  if (!lease || lease.token !== token || initial.kind !== "live") return commonResult("lost", {}, context);
  const initialBeat = await heartbeat(taskId, token);
  if (initialBeat.status !== "ok") return commonResult("lost", {}, context);
  let currentLease = initialBeat.lease;
  const startedAt = Date.now();
  const deadline = startedAt + maxSeconds * 1000;
  const pollMs = envInterval("MAYA_TICK_POLL_MS", 30_000);
  const heartbeatMs = envInterval("MAYA_TICK_HEARTBEAT_MS", 60_000);
  let nextPollAt = Date.now();
  let nextHeartbeatAt = Date.now() + heartbeatMs;
  let tagRepairAt = 0;
  let lastClass = { state: stateFor("working"), fingerprint: "working" };
  let failureSince = null;
  let board = null;
  let boardError = null;
  let sseDebounce;
  const controller = new AbortController();
  let wakeVersion = 0;
  let waiters = [];
  const notify = () => {
    wakeVersion++;
    for (const resolve of waiters.splice(0)) resolve();
  };
  const sse = readSseLoop(taskId, controller, () => {
    clearTimeout(sseDebounce);
    sseDebounce = setTimeout(() => { sseDebounce = null; notify(); }, 500);
  });
  const contextNow = () => ({ ...context, title: currentLease.title, stage: currentLease.stageName });

  try {
    while (Date.now() < deadline) {
      if (!board) {
        try {
          board = await loadBoard();
          boardError = null;
        } catch (error) {
          boardError = error;
        }
      }
      if (board) {
        try {
          const evaluated = await evaluateWatch(taskId, token, board, currentLease, contextNow(), startedAt, tagRepairAt);
          if (evaluated.result) return evaluated.result;
          if (evaluated.board) board = evaluated.board;
          if (evaluated.lease) currentLease = evaluated.lease;
          if (evaluated.tagRepairAt !== undefined) tagRepairAt = evaluated.tagRepairAt;
          if (evaluated.retry) {
            nextPollAt = Date.now() + (evaluated.delayMs ?? 1_000);
          } else {
            lastClass = { state: evaluated.state, fingerprint: evaluated.fingerprint };
            failureSince = null;
            if (seen !== lastClass.fingerprint) {
              return commonResult("changed", { state: lastClass.state, fingerprint: lastClass.fingerprint }, contextNow());
            }
            nextPollAt = Date.now() + pollMs;
          }
        } catch (error) {
          if (failureSince === null) failureSince = Date.now();
          boardError = error;
          if (Date.now() - failureSince >= 120_000) {
            return commonResult("error", { error: error.message, agentifyDown: true }, contextNow());
          }
          nextPollAt = Date.now() + Math.min(pollMs, 1_000);
        }
      } else {
        if (failureSince === null) failureSince = Date.now();
        if (Date.now() - failureSince >= 120_000) {
          return commonResult("error", { error: boardError?.message ?? "Agentify unavailable", agentifyDown: true }, contextNow());
        }
        nextPollAt = Date.now() + Math.min(pollMs, 1_000);
      }

      if (Date.now() >= deadline) break;
      if (Date.now() >= nextHeartbeatAt) {
        const beat = await heartbeat(taskId, token);
        if (beat.status === "lost") return commonResult("lost", {}, contextNow());
        if (beat.status === "ok") currentLease = beat.lease;
        nextHeartbeatAt = Date.now() + heartbeatMs;
      }
      const waitMs = Math.max(1, Math.min(deadline, nextPollAt, nextHeartbeatAt) - Date.now());
      const version = wakeVersion;
      await Promise.race([
        new Promise((resolve) => setTimeout(resolve, waitMs)),
        new Promise((resolve) => {
          if (wakeVersion !== version) resolve();
          else waiters.push(resolve);
        }),
      ]);
      if (wakeVersion !== version) nextPollAt = Date.now();
    }
    return commonResult("timeout", { state: lastClass.state, fingerprint: lastClass.fingerprint }, contextNow());
  } finally {
    controller.abort();
    clearTimeout(sseDebounce);
    for (const resolve of waiters.splice(0)) resolve();
    await sse.catch(() => {});
  }
}

function parseArgs(argv) {
  const command = argv[0];
  if (!["claim", "watch", "release", "status", "candidates"].includes(command)) throw new TypeError("Use claim, watch, release, status, or candidates");
  const options = {};
  for (let index = 1; index < argv.length; index++) {
    const key = argv[index];
    if (!["--holder", "--task", "--token", "--max-seconds", "--seen"].includes(key)) throw new TypeError(`Unknown argument: ${key}`);
    const value = argv[++index];
    if (value === undefined || value.startsWith("--")) throw new TypeError(`Missing value for ${key}`);
    const name = { "--holder": "holder", "--task": "taskId", "--token": "token", "--max-seconds": "maxSeconds", "--seen": "seen" }[key];
    if (Object.hasOwn(options, name)) throw new TypeError(`Duplicate argument: ${key}`);
    options[name] = name === "maxSeconds" ? Number(value) : value;
  }
  if (command === "claim") {
    if (options.taskId || options.token || options.maxSeconds !== undefined || options.seen !== undefined) throw new TypeError("claim accepts only --holder");
  } else if (command === "watch") {
    if (!options.taskId || !options.token) throw new TypeError("watch requires --task and --token");
    if (options.holder !== undefined) throw new TypeError("watch does not accept --holder");
  } else if (command === "release") {
    if (!options.taskId || !options.token) throw new TypeError("release requires --task and --token");
    if (options.maxSeconds !== undefined || options.seen !== undefined || options.holder !== undefined) throw new TypeError("release accepts only --task and --token");
  } else if (Object.keys(options).length) {
    throw new TypeError(`${command} takes no arguments`);
  }
  return { command, options };
}

export async function runCli(argv = process.argv.slice(2)) {
  try {
    const { command, options } = parseArgs(argv);
    let result;
    if (command === "claim") result = await claimTask(options);
    else if (command === "watch") result = await watchTask(options);
    else if (command === "release") result = await releaseTask(options.taskId, options.token);
    else if (command === "status") result = await status();
    else result = await candidates();
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (command === "status" && result.agentifyDown) process.exitCode = 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ error: error.message })}\n`);
    process.exitCode = 1;
  }
}

function isEntryPoint() {
  if (import.meta.main !== undefined) return import.meta.main;
  try {
    return realpathSync(process.argv[1]).toLowerCase() === realpathSync(fileURLToPath(import.meta.url)).toLowerCase();
  } catch {
    return false;
  }
}

if (isEntryPoint()) await runCli();
