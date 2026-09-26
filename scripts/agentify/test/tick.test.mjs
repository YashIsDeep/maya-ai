import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, test } from "node:test";
import { createFakeAgentify } from "./fake-agentify.mjs";
import { readLease, tryAcquire } from "../claims.mjs";
import {
  candidates,
  claimTask,
  classifyVisit,
  readiness,
  releaseTask,
  runState,
  status,
  watchTask,
} from "../tick.mjs";

const STAGE_NAMES = ["Backlog", "Plan", "Implement", "Review", "Merge", "Done"];
const STAGES = STAGE_NAMES.map((name, position) => ({ id: `stage-${name.toLowerCase()}`, name, position }));
const WORKFLOW = { id: "maya-build", name: "Maya Build", stages: STAGES };
const stageId = (name) => STAGES.find((stage) => stage.name === name).id;
const tickPath = fileURLToPath(new URL("../tick.mjs", import.meta.url));
const worktreeRoot = fileURLToPath(new URL("../../../", import.meta.url));
const ENV_KEYS = [
  "AGENTIFY_API", "MAYA_CLAIMS_DIR", "MAYA_CLAIMS_TEST_BARRIER", "MAYA_CLAIMS_TEST_HOLD_MS", "MAYA_CLAIMS_TEST_LOCK_WAIT_MS",
  "MAYA_TICK_POLL_MS", "MAYA_TICK_HEARTBEAT_MS", "MAYA_TICK_START_GRACE_MS",
];
let context;

beforeEach(async () => {
  const saved = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
  const directory = mkdtempSync(join(worktreeRoot, ".maya-tick-test-"));
  const tasks = [];
  const workflows = [WORKFLOW];
  const fake = await createFakeAgentify({ workflows, tasks });
  const stagesById = new Map(STAGES.map((stage) => [stage.id, stage.name]));
  Object.defineProperty(tasks, "stagesById", { value: stagesById, configurable: true });
  process.env.AGENTIFY_API = fake.url;
  process.env.MAYA_CLAIMS_DIR = directory;
  for (const key of ENV_KEYS.slice(2)) delete process.env[key];
  context = { saved, directory, tasks, workflows, fake, stagesById };
});

afterEach(async () => {
  try {
    assert.equal(context.fake.forbiddenRequests.length, 0, `forbidden Agentify calls: ${JSON.stringify(context.fake.forbiddenRequests)}`);
  } finally {
    await context.fake.close();
    rmSync(context.directory, { recursive: true, force: true });
    for (const [key, value] of context.saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(10);
  }
  assert.fail("Timed out waiting for test condition");
}

function makeTask(id, titleId, stage, options = {}) {
  const currentVisitId = `visit-${id}`;
  return {
    id,
    workflowId: WORKFLOW.id,
    status: options.status ?? "active",
    title: `[${titleId}] ${options.title ?? "Test task"}`,
    description: options.description ?? `**Depends on.** ${options.depends ?? "none"}`,
    currentStageId: stageId(stage),
    currentVisitId,
    createdAt: options.createdAt ?? Date.parse("2026-09-01T00:00:00.000Z"),
    tags: [...(options.tags ?? [])],
    ...(options.archivedAt ? { archivedAt: options.archivedAt } : {}),
  };
}

function addTask(id, titleId, stage, options = {}) {
  const task = makeTask(id, titleId, stage, options);
  context.tasks.push(task);
  const detail = context.fake.detailFor(id);
  detail.task = task;
  detail.visits = [{ id: task.currentVisitId, runs: [] }];
  return task;
}

function detailFor(taskId) {
  return context.fake.detailFor(taskId);
}

function setRuns(taskId, runs) {
  const detail = detailFor(taskId);
  detail.visits = [{ id: detail.task.currentVisitId, runs }];
  return detail;
}

function makeRun(id, statusName, options = {}) {
  return {
    id,
    status: statusName,
    label: options.label ?? "Plan · Opus 5.5",
    error: options.error ?? null,
    resumeAt: options.resumeAt ?? null,
    retryOfRunId: options.retryOfRunId ?? null,
    bindingKey: options.bindingKey ?? "plan",
    config: options.config ?? {},
    ...(options.question ? { question: options.question } : {}),
  };
}

function runCli(args, env = {}, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tickPath, ...args], {
      env: { ...process.env, AGENTIFY_API: context.fake.url, MAYA_CLAIMS_DIR: context.directory, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      try { resolve({ result: JSON.parse(stdout.trim()), code, stderr }); }
      catch (error) { reject(new Error(`Invalid CLI JSON (exit ${code ?? signal}): ${stdout}\n${stderr}`, { cause: error })); }
    });
  });
}

async function takeLease(task) {
  const stage = STAGES.find((candidate) => candidate.id === task.currentStageId);
  return tryAcquire({ taskId: task.id, title: task.title, stageId: stage.id, stageName: stage.name, holder: `test-${task.id}` });
}

function writeExpiredLease(taskId, token) {
  const now = new Date(Date.now() - 20_000).toISOString();
  writeFileSync(join(context.directory, `${taskId}.json`), JSON.stringify({
    token,
    holder: "expired-holder",
    taskId,
    title: "expired",
    stageId: stageId("Review"),
    stageName: "Review",
    claimedAt: now,
    heartbeatAt: now,
    expiresAt: new Date(Date.now() - 1_000).toISOString(),
    retried: [],
  }), { flag: "wx" });
}

function spawnWatch(taskId, token, barrier) {
  let finish;
  let fail;
  let child;
  const result = new Promise((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  child = spawn(process.execPath, [tickPath, "watch", "--task", taskId, "--token", token, "--max-seconds", "1"], {
    env: { ...process.env, AGENTIFY_API: context.fake.url, MAYA_CLAIMS_DIR: context.directory, MAYA_CLAIMS_TEST_BARRIER: barrier, MAYA_TICK_POLL_MS: "60000" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  const timer = setTimeout(() => child.kill(), 15_000);
  child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
  child.once("error", fail);
  child.once("close", (code) => {
    clearTimeout(timer);
    try { finish({ result: JSON.parse(stdout.trim()), code, stderr }); }
    catch (error) { fail(new Error(`Invalid watch JSON: ${stdout}\n${stderr}`, { cause: error })); }
  });
  const ready = new Promise((resolve) => child.once("spawn", resolve));
  return { child, ready, result };
}

test("10. Ranking prefers the furthest stage, then oldest task, and excludes Done, archived, and live-leased tasks", async () => {
  const laterMerge = addTask("task-merge-new", "PX-11", "Merge", { createdAt: Date.parse("2026-09-03") });
  const olderMerge = addTask("task-merge-old", "PX-10", "Merge", { createdAt: Date.parse("2026-09-02") });
  addTask("task-review", "PX-09", "Review");
  addTask("task-implement", "PX-08", "Implement");
  addTask("task-plan", "PX-07", "Plan");
  addTask("task-backlog-new", "PX-06", "Backlog", { createdAt: Date.parse("2026-09-04") });
  addTask("task-backlog-old", "PX-01", "Backlog", { createdAt: Date.parse("2026-08-29") });
  addTask("task-done", "PX-05", "Done");
  addTask("task-archived", "PX-04", "Review", { status: "archived" });
  addTask("task-live", "PX-03", "Implement");
  const foreign = addTask("task-foreign", "PX-99", "Merge");
  foreign.workflowId = "other-workflow";
  await takeLease(context.tasks.find((task) => task.id === "task-live"));
  const expiredTask = addTask("task-expired", "PX-02", "Plan", { createdAt: Date.parse("2026-08-30") });
  const expired = await takeLease(expiredTask);
  const expiredLease = { ...expired.lease, expiresAt: new Date(Date.now() - 1).toISOString() };
  writeFileSync(join(context.directory, `${expiredTask.id}.json`), JSON.stringify(expiredLease));

  const result = await candidates();
  assert.deepEqual(result.candidates.map((row) => row.taskId), [
    olderMerge.id, laterMerge.id, "task-review", "task-implement", expiredTask.id, "task-plan", "task-backlog-old", "task-backlog-new",
  ]);
  assert.ok(!result.candidates.some((row) => ["task-done", "task-archived", "task-live"].includes(row.taskId)));
  assert.ok(result.candidates.find((row) => row.taskId === expiredTask.id));
});

test("11. Readiness accepts none, Done, archived, and split IDs; it explains every blocked form", async () => {
  const none = addTask("ready-none", "PX-01", "Backlog", { depends: "none" });
  const done = addTask("dep-done", "M0-00", "Done");
  const dependsDone = addTask("ready-done", "PX-02", "Backlog", { depends: "M0-00" });
  addTask("dep-archived", "M0-01", "Review", { status: "archived" });
  const dependsArchived = addTask("ready-archived", "PX-03", "Backlog", { depends: "M0-01" });
  addTask("dep-split", "FD-08a", "Done");
  const dependsSplit = addTask("ready-split", "PX-04", "Backlog", { depends: "FD-08a" });
  addTask("dep-review", "M0-02", "Review");
  const blockedStage = addTask("blocked-stage", "PX-05", "Backlog", { depends: "M0-02" });
  const blockedUnknown = addTask("blocked-unknown", "PX-06", "Backlog", { depends: "ZZ-99" });
  const missing = addTask("blocked-missing", "PX-07", "Backlog", { description: "No dependency metadata." });
  const tbd = addTask("blocked-tbd", "PX-08", "Backlog", { depends: "TBD" });

  for (const task of [none, dependsDone, dependsArchived, dependsSplit]) assert.equal(readiness(task, context.tasks).ready, true);
  assert.equal(readiness(none, context.tasks).reason, "No dependencies.");
  assert.match(readiness(dependsDone, context.tasks).reason, /M0-00: Done/);
  assert.match(readiness(dependsArchived, context.tasks).reason, /M0-01: archived/);
  assert.match(readiness(dependsSplit, context.tasks).reason, /FD-08a: Done/);
  assert.equal(readiness(blockedStage, context.tasks).ready, false);
  assert.match(readiness(blockedStage, context.tasks).reason, /not Done or archived/);
  assert.match(readiness(blockedUnknown, context.tasks).reason, /ZZ-99 is unknown/);
  assert.match(readiness(missing, context.tasks).reason, /line is missing/);
  assert.match(readiness(tbd, context.tasks).reason, /no dependency IDs or 'none'/);
  assert.ok(done);
});

test("12. Three active slots plus a ready Backlog task reports the active-task limit", async () => {
  const plan = addTask("limit-plan", "PX-10", "Plan");
  const implement = addTask("limit-implement", "PX-11", "Implement");
  const review = addTask("limit-review", "PX-12", "Review");
  for (const task of [plan, implement, review]) assert.equal((await takeLease(task)).status, "ok");
  addTask("limit-backlog", "PX-13", "Backlog");
  const result = await claimTask();
  assert.equal(result.none, true);
  assert.equal(result.code, "limit");
  assert.equal(result.counts.active, 3);
});

test("12. A claimed Backlog task reserves the third active slot", async () => {
  const plan = addTask("reserve-plan", "PX-20", "Plan");
  const implement = addTask("reserve-implement", "PX-21", "Implement");
  await takeLease(plan);
  await takeLease(implement);
  const firstBacklog = addTask("reserve-backlog-one", "PX-22", "Backlog");
  const secondBacklog = addTask("reserve-backlog-two", "PX-23", "Backlog");
  await takeLease(firstBacklog);
  const result = await claimTask();
  assert.equal(result.none, true);
  assert.equal(result.code, "limit");
  assert.equal(result.counts.active, 3);
  assert.equal(result.counts.backlogReady, 2);
  assert.ok(secondBacklog);
});

test("12. Claim-none codes distinguish all-watched, nothing-ready, and a busy start lock", async () => {
  const only = addTask("watched-only", "PX-30", "Review");
  await takeLease(only);
  assert.equal((await claimTask()).code, "all-watched");

  context.tasks.splice(0);
  addTask("not-ready", "PX-31", "Backlog", { depends: "TBD" });
  assert.equal((await claimTask()).code, "nothing-ready");

  context.tasks.splice(0);
  addTask("lock-ready", "PX-32", "Backlog");
  const lock = join(context.directory, "_start.lock.0");
  const { mkdirSync } = await import("node:fs");
  mkdirSync(lock);
  process.env.MAYA_CLAIMS_TEST_LOCK_WAIT_MS = "200";
  const result = await claimTask();
  assert.equal(result.none, true);
  assert.equal(result.code, "busy");
});

test("13. Six concurrent CLI claimers get one task once, with no duplicate claims", async () => {
  addTask("claim-single", "PX-40", "Backlog");
  const results = await Promise.all(Array.from({ length: 6 }, () => runCli(["claim"])));
  const winners = results.filter(({ result }) => result.taskId);
  assert.equal(winners.length, 1);
  assert.equal(new Set(winners.map(({ result }) => result.taskId)).size, 1);
  assert.equal(results.filter(({ result }) => result.code === "all-watched").length, 5);
});

test("13. Six concurrent CLI claimers reserve three distinct ready Backlog tasks", async () => {
  for (let index = 0; index < 3; index++) addTask(`claim-many-${index}`, `PX-4${index}`, "Backlog", { createdAt: Date.parse(`2026-09-0${index + 1}`) });
  const results = await Promise.all(Array.from({ length: 6 }, () => runCli(["claim"])));
  const winners = results.filter(({ result }) => result.taskId).map(({ result }) => result.taskId);
  assert.equal(winners.length, 3);
  assert.equal(new Set(winners).size, 3);
});

test("13. Concurrent CLI claimers take over one expired lease exactly once", async () => {
  const task = addTask("claim-stale", "PX-49", "Merge");
  writeExpiredLease(task.id, randomUUID());
  const results = await Promise.all(Array.from({ length: 6 }, () => runCli(["claim"])));
  const winners = results.filter(({ result }) => result.taskId);
  assert.equal(winners.length, 1);
  assert.equal(winners[0].result.taskId, task.id);
  assert.equal(winners[0].result.tookOver, true);
  assert.equal(readLease(task.id).lease.token, winners[0].result.token);
});

test("13. Concurrent Backlog claimers reserve only the one slot left after two active tasks", async () => {
  for (let index = 0; index < 2; index++) {
    const active = addTask(`claim-active-${index}`, `PX-5${index}`, index ? "Implement" : "Plan");
    await takeLease(active);
  }
  for (let index = 0; index < 3; index++) addTask(`claim-backlog-${index}`, `PX-6${index}`, "Backlog");
  const results = await Promise.all(Array.from({ length: 4 }, () => runCli(["claim"])));
  const winners = results.filter(({ result }) => result.taskId);
  assert.equal(winners.length, 1);
  assert.equal(winners[0].result.stage, "Backlog");
  assert.equal(new Set(winners.map(({ result }) => result.taskId)).size, 1);
});

test("14. Claim and release preserve other tags, and a wrong token changes nothing", async () => {
  const task = addTask("tag-main", "PX-70", "Backlog", { tags: ["process", "important"] });
  const claim = await claimTask();
  assert.equal(claim.taskId, task.id);
  assert.deepEqual(task.tags.sort(), ["important", "process", "watched"]);
  const wrong = await releaseTask(task.id, randomUUID());
  assert.equal(wrong.released, false);
  assert.ok(task.tags.includes("watched"));
  assert.equal(readLease(task.id).lease.token, claim.token);
  const released = await releaseTask(task.id, claim.token);
  assert.equal(released.released, true);
  assert.deepEqual(task.tags.sort(), ["important", "process"]);
  assert.equal(readLease(task.id).kind, "none");
});

test("14. Status and claim remove stale watched tags but preserve a live claim tag", async () => {
  const stale = addTask("tag-stale", "PX-71", "Plan", { tags: ["watched", "keep"] });
  const live = addTask("tag-live", "PX-72", "Review", { tags: ["watched", "keep"] });
  await takeLease(live);
  const statusResult = await status();
  assert.ok(statusResult.leases.every((lease) => !Object.hasOwn(lease, "token")));
  assert.deepEqual(stale.tags, ["keep"]);
  assert.deepEqual(live.tags, ["watched", "keep"]);

  const secondStale = addTask("tag-claim-clean", "PX-73", "Plan", { tags: ["watched", "other"] });
  const pick = addTask("tag-claim-pick", "PX-74", "Merge");
  const result = await claimTask();
  assert.equal(result.taskId, pick.id);
  assert.deepEqual(secondStale.tags, ["other"]);
});

test("14. Candidates is read-only; watch restores the watched tag once removed", async () => {
  const task = addTask("tag-readonly", "PX-75", "Implement", { tags: ["keep"] });
  const patchCount = () => context.fake.requests.filter((request) => request.method === "PATCH").length;
  const before = patchCount();
  const absentClaimsDir = join(context.directory, "candidates-must-not-create");
  process.env.MAYA_CLAIMS_DIR = absentClaimsDir;
  await candidates();
  assert.equal(existsSync(absentClaimsDir), false);
  assert.equal(patchCount(), before);
  process.env.MAYA_CLAIMS_DIR = context.directory;

  task.tags.push("watched");
  const lease = await takeLease(task);
  process.env.MAYA_TICK_POLL_MS = "80";
  const watching = watchTask({ taskId: task.id, token: lease.lease.token, maxSeconds: 1, seen: "working" });
  await waitFor(() => context.fake.requests.some((request) => request.path === `/api/tasks/${task.id}`));
  await sleep(50);
  task.tags = ["keep"];
  const result = await watching;
  assert.equal(result.event, "timeout");
  assert.ok(task.tags.includes("watched"));
});

test("15. Watch starts one ready Backlog task with Plan and runActions=true", async () => {
  addTask("start-dep", "M0-00", "Done");
  const task = addTask("start-ready", "PX-80", "Backlog", { depends: "M0-00" });
  const lease = await takeLease(task);
  const result = await watchTask({ taskId: task.id, token: lease.lease.token, maxSeconds: 2 });
  assert.equal(result.event, "acted");
  assert.equal(result.action, "started");
  assert.deepEqual(context.fake.requests.filter((request) => request.method === "POST" && request.path.endsWith("/move")).map((request) => request.body), [
    { stageId: stageId("Plan"), runActions: true },
  ]);
  assert.equal(task.currentStageId, stageId("Plan"));
});

test("15. Watch blocks a Backlog task whose dependency is no longer Done", async () => {
  const dependency = addTask("start-dependency-moves", "M0-10", "Done");
  const task = addTask("start-not-ready", "PX-81", "Backlog", { depends: "M0-10" });
  const lease = await takeLease(task);
  dependency.currentStageId = stageId("Review");
  const result = await watchTask({ taskId: task.id, token: lease.lease.token, maxSeconds: 2 });
  assert.equal(result.event, "blocked");
  assert.match(result.reason, /not Done or archived/);
  assert.equal(context.fake.requests.filter((request) => request.method === "POST" && request.path.endsWith("/move")).length, 0);
});

test("15. Watch blocks a Backlog task when three tasks are already active", async () => {
  addTask("start-active-plan", "PX-82", "Plan");
  addTask("start-active-implement", "PX-83", "Implement");
  addTask("start-active-review", "PX-84", "Review");
  const task = addTask("start-cap", "PX-85", "Backlog");
  const lease = await takeLease(task);
  const result = await watchTask({ taskId: task.id, token: lease.lease.token, maxSeconds: 2 });
  assert.equal(result.event, "blocked");
  assert.match(result.reason, /3 active tasks/);
  assert.equal(context.fake.requests.filter((request) => request.method === "POST" && request.path.endsWith("/move")).length, 0);
});

test("15. Two Backlog watchers cannot both move past the third active slot", async () => {
  addTask("race-active-plan", "PX-90", "Plan");
  addTask("race-active-implement", "PX-91", "Implement");
  const first = addTask("race-backlog-one", "PX-92", "Backlog");
  const second = addTask("race-backlog-two", "PX-93", "Backlog");
  const firstLease = await takeLease(first);
  const secondLease = await takeLease(second);
  const barrier = join(context.directory, "watch-race-barrier");
  const children = [
    spawnWatch(first.id, firstLease.lease.token, barrier),
    spawnWatch(second.id, secondLease.lease.token, barrier),
  ];
  await Promise.all(children.map((child) => child.ready));
  await sleep(250);
  writeFileSync(barrier, "go");
  const results = await Promise.all(children.map((child) => child.result));
  assert.equal(results.filter(({ result }) => result.event === "acted" && result.action === "started").length, 1);
  assert.equal(results.filter(({ result }) => result.event === "blocked").length, 1);
  assert.equal(context.fake.requests.filter((request) => request.method === "POST" && request.path.endsWith("/move")).length, 1);
  assert.equal([first, second].filter((task) => task.currentStageId === stageId("Plan")).length, 1);
});

test("15. A failed start returns an error that names the failed action", async () => {
  const task = addTask("start-failure", "PX-94", "Backlog");
  const lease = await takeLease(task);
  context.fake.setMoveFailure(500, "test move failure");
  const result = await watchTask({ taskId: task.id, token: lease.lease.token, maxSeconds: 2 });
  assert.equal(result.event, "error");
  assert.equal(result.after, "start");
  assert.match(result.error, /test move failure/);
});

test("16. Interrupted runs and inactivity timeouts retry once without overrides", async () => {
  for (const [taskId, titleId, state, error, runId] of [
    ["retry-interrupted", "PX-100", "interrupted", "agent process interrupted", 7],
    ["retry-inactivity", "PX-101", "failed", "Agent inactivity timeout after 1800 seconds", 8],
  ]) {
    const task = addTask(taskId, titleId, "Implement");
    const run = makeRun(runId, state, { error });
    setRuns(task.id, [run]);
    const lease = await takeLease(task);
    const result = await watchTask({ taskId: task.id, token: lease.lease.token, maxSeconds: 2 });
    assert.equal(result.event, "acted");
    assert.equal(result.action, "retried");
    assert.equal(result.runId, runId);
    const retried = context.fake.requests.filter((request) => request.method === "POST" && request.path === `/api/runs/${runId}/retry`);
    assert.deepEqual(retried.at(-1).body, {});
    assert.ok(readLease(task.id).lease.retried.includes(runId));
  }
});

test("16. Other failures, retries of retries, and retried failures go to the owner", async () => {
  const ordinary = addTask("failure-ordinary", "PX-102", "Implement");
  setRuns(ordinary.id, [makeRun(20, "failed", { error: "compiler error" })]);
  const ordinaryLease = await takeLease(ordinary);
  const owner = await watchTask({ taskId: ordinary.id, token: ordinaryLease.lease.token, maxSeconds: 2 });
  assert.equal(owner.event, "changed");
  assert.equal(owner.state.kind, "failure");
  assert.equal(owner.state.error, "compiler error");

  const retryOfRetry = addTask("failure-retry-of-retry", "PX-103", "Implement");
  setRuns(retryOfRetry.id, [makeRun(21, "interrupted", { retryOfRunId: 11, error: "interrupted" })]);
  const retryLease = await takeLease(retryOfRetry);
  const retryOwner = await watchTask({ taskId: retryOfRetry.id, token: retryLease.lease.token, maxSeconds: 2 });
  assert.equal(retryOwner.state.kind, "failure");

  const alreadyRetried = addTask("failure-already-retried", "PX-104", "Implement");
  setRuns(alreadyRetried.id, [
    makeRun(22, "failed", { error: "timeout" }),
    makeRun(23, "queued", { retryOfRunId: 22 }),
  ]);
  const alreadyLease = await takeLease(alreadyRetried);
  const waiting = await watchTask({ taskId: alreadyRetried.id, token: alreadyLease.lease.token, maxSeconds: 2 });
  assert.equal(waiting.state.status, "working");
  assert.equal(context.fake.requests.filter((request) => request.method === "POST" && request.path === "/api/runs/22/retry").length, 0);

  const superseded = addTask("failure-superseded", "PX-108", "Implement");
  setRuns(superseded.id, [
    makeRun(24, "failed", { error: "old failure", bindingKey: "plan" }),
    makeRun(25, "succeeded", { bindingKey: "plan" }),
  ]);
  const supersededLease = await takeLease(superseded);
  const supersededResult = await watchTask({ taskId: superseded.id, token: supersededLease.lease.token, maxSeconds: 2 });
  assert.equal(supersededResult.state.status, "working");
});

test("16. A failed Merge run is classified as merge-failure", async () => {
  const task = addTask("merge-failure", "PX-105", "Merge");
  setRuns(task.id, [makeRun(30, "failed", { error: "merge conflict" })]);
  const lease = await takeLease(task);
  const result = await watchTask({ taskId: task.id, token: lease.lease.token, maxSeconds: 2 });
  assert.equal(result.state.kind, "merge-failure");
  assert.match(result.state.error, /merge conflict/);
});

test("16. A retried run stays working once even when Agentify has not listed the retry run", async () => {
  const task = addTask("retry-once", "PX-106", "Implement");
  setRuns(task.id, [makeRun(31, "interrupted", { error: "interrupted" })]);
  context.fake.setCreateRetryRun(false);
  const lease = await takeLease(task);
  assert.equal((await watchTask({ taskId: task.id, token: lease.lease.token, maxSeconds: 2 })).action, "retried");
  const next = await watchTask({ taskId: task.id, token: lease.lease.token, maxSeconds: 2 });
  assert.equal(next.event, "changed");
  assert.equal(next.state.status, "working");
  assert.equal(context.fake.requests.filter((request) => request.method === "POST" && request.path === "/api/runs/31/retry").length, 1);
});

test("16. A failed retry POST is not repeated during the same lease", async () => {
  const task = addTask("retry-post-failure", "PX-107", "Implement");
  setRuns(task.id, [makeRun(32, "interrupted", { error: "interrupted" })]);
  context.fake.setRetryFailure(500, "retry unavailable");
  const lease = await takeLease(task);
  const failed = await watchTask({ taskId: task.id, token: lease.lease.token, maxSeconds: 2 });
  assert.equal(failed.event, "error");
  assert.equal(failed.after, "retry");
  const next = await watchTask({ taskId: task.id, token: lease.lease.token, maxSeconds: 2 });
  assert.equal(next.state.status, "working");
  assert.equal(context.fake.requests.filter((request) => request.method === "POST" && request.path === "/api/runs/32/retry").length, 1);
});

test("17. Visit classification reports questions, approvals, quota, working, unknown, and start fingerprints", async () => {
  for (const [raw, normalized] of [
    ["waiting", "slot-wait"], ["queued", "queued"], ["running", "running"], ["awaiting-approval", "approval"],
    ["quota-wait", "quota"], ["failed", "failed"], ["interrupted", "interrupted"], ["succeeded", "succeeded"],
    ["skipped", "skipped"], ["cancelled", "cancelled"], ["sent-back", "sent-back"], ["unrecognized", "unknown"],
  ]) assert.equal(runState({ status: raw }), normalized, `status mapping for ${raw}`);

  const questionTask = addTask("class-question", "PX-110", "Implement");
  const questionRun = makeRun(40, "running", {
    question: { id: "question-1", preamble: "Need a choice", fields: [{ text: "Which target?" }] },
  });
  const secondQuestionRun = makeRun(39, "running", {
    question: { id: "question-0", preamble: "Need one more detail", fields: [] },
  });
  const question = classifyVisit(setRuns(questionTask.id, [questionRun, secondQuestionRun]), "Implement");
  assert.equal(question.state.status, "needs-owner");
  assert.equal(question.state.kind, "question");
  assert.equal(question.state.questions[0].text, "Need a choice\nWhich target?");
  assert.equal(question.state.questions[1].text, "Need one more detail");
  assert.equal(question.fingerprint, "question:question-0,question-1");

  const approvalTask = addTask("class-approval", "PX-111", "Plan");
  setRuns(approvalTask.id, [makeRun(41, "awaiting-approval", { config: { saveResultAs: "plan-review.md" } })]);
  context.fake.setArtifact(approvalTask.id, "plan-review.md", "# Plan review\n**Verdict:** APPROVE\n");
  const approvalLease = await takeLease(approvalTask);
  const approval = await watchTask({ taskId: approvalTask.id, token: approvalLease.lease.token, maxSeconds: 2 });
  assert.equal(approval.state.kind, "approval");
  assert.equal(approval.state.label, "Plan · Opus 5.5");
  assert.deepEqual(approval.state.artifacts, ["plan.md", "plan-review.md"]);
  assert.equal(approval.state.verdict, "**Verdict:** APPROVE");
  assert.equal(approval.fingerprint, "approval:41");

  const quotaTask = addTask("class-quota", "PX-112", "Implement");
  const quota = classifyVisit(setRuns(quotaTask.id, [makeRun(42, "quota-wait", { resumeAt: "2026-09-27T10:00:00Z" })]), "Implement");
  assert.equal(quota.state.status, "quota");
  assert.equal(quota.state.resumeAt, "2026-09-27T10:00:00Z");
  assert.equal(quota.fingerprint, "quota:42:2026-09-27T10:00:00Z");

  const workingTask = addTask("class-working", "PX-113", "Implement");
  const working = classifyVisit(setRuns(workingTask.id, [makeRun(43, "running")]), "Implement");
  assert.equal(working.state.status, "working");
  assert.equal(working.fingerprint, "working");

  const unknownTask = addTask("class-unknown", "PX-114", "Implement");
  const unknown = classifyVisit(setRuns(unknownTask.id, [makeRun(44, "new-agentify-status")]), "Implement");
  assert.equal(unknown.state.kind, "unknown");
  assert.equal(unknown.state.rawStatus, "new-agentify-status");
  assert.equal(unknown.fingerprint, "unknown:44:new-agentify-status");

  const startTask = addTask("class-start", "PX-115", "Plan");
  setRuns(startTask.id, []);
  const startLease = await takeLease(startTask);
  process.env.MAYA_TICK_START_GRACE_MS = "0";
  const start = await watchTask({ taskId: startTask.id, token: startLease.lease.token, maxSeconds: 2, seen: "something-else" });
  assert.equal(start.state.kind, "start");
  assert.equal(start.fingerprint, `start:${stageId("Plan")}`);
});

test("18. Watch returns changed on a new fingerprint, times out on a seen fingerprint, and caps max-seconds", async () => {
  const task = addTask("watch-return", "PX-120", "Implement");
  setRuns(task.id, [makeRun(50, "running")]);
  const lease = await takeLease(task);
  const changed = await watchTask({ taskId: task.id, token: lease.lease.token, maxSeconds: 2, seen: "different" });
  assert.equal(changed.event, "changed");
  assert.equal(changed.fingerprint, "working");

  const timeout = await watchTask({ taskId: task.id, token: lease.lease.token, maxSeconds: 1, seen: "working" });
  assert.equal(timeout.event, "timeout");
  assert.equal(timeout.state.status, "working");
  await assert.rejects(watchTask({ taskId: task.id, token: lease.lease.token, maxSeconds: 551 }), /from 1 to 550/);
});

test("19. SSE stage changes report advanced, and Review advancement includes review.md verdict", async () => {
  const task = addTask("sse-review", "PX-130", "Review");
  setRuns(task.id, [makeRun(60, "succeeded")]);
  const lease = await takeLease(task);
  context.fake.setArtifact(task.id, "review.md", "# Review\n**Verdict:** APPROVE\n");
  process.env.MAYA_TICK_POLL_MS = "60000";
  const watching = watchTask({ taskId: task.id, token: lease.lease.token, maxSeconds: 5, seen: "working" });
  await context.fake.sseConnected();
  task.currentStageId = stageId("Merge");
  context.fake.emit({ taskId: task.id, type: "stage-changed" });
  const result = await watching;
  assert.equal(result.event, "advanced");
  assert.equal(result.from, "Review");
  assert.equal(result.to, "Merge");
  assert.equal(result.verdict, "**Verdict:** APPROVE");
});

test("19. SSE stage changes report moved-back", async () => {
  const task = addTask("sse-back", "PX-131", "Implement");
  setRuns(task.id, [makeRun(61, "succeeded")]);
  const lease = await takeLease(task);
  process.env.MAYA_TICK_POLL_MS = "60000";
  const watching = watchTask({ taskId: task.id, token: lease.lease.token, maxSeconds: 5, seen: "working" });
  await context.fake.sseConnected();
  task.currentStageId = stageId("Plan");
  context.fake.emit(`Task ${task.id} moved`);
  const result = await watching;
  assert.equal(result.event, "moved-back");
  assert.equal(result.from, "Implement");
  assert.equal(result.to, "Plan");
});

test("19. Polling detects a stage change when no matching SSE event arrives", async () => {
  const task = addTask("poll-stage", "PX-134", "Plan");
  setRuns(task.id, [makeRun(64, "running")]);
  const lease = await takeLease(task);
  process.env.MAYA_TICK_POLL_MS = "100";
  const watching = watchTask({ taskId: task.id, token: lease.lease.token, maxSeconds: 3, seen: "working" });
  await context.fake.sseConnected();
  await sleep(150);
  task.currentStageId = stageId("Implement");
  const result = await watching;
  assert.equal(result.event, "advanced");
  assert.equal(result.to, "Implement");
});

test("19. SSE archive and 404 both report gone", async () => {
  const task = addTask("sse-archive", "PX-132", "Implement");
  setRuns(task.id, [makeRun(62, "running")]);
  const lease = await takeLease(task);
  process.env.MAYA_TICK_POLL_MS = "60000";
  const watching = watchTask({ taskId: task.id, token: lease.lease.token, maxSeconds: 5, seen: "working" });
  await context.fake.sseConnected();
  task.status = "archived";
  context.fake.emit(`Task ${task.id} changed`);
  assert.equal((await watching).event, "gone");
});

test("19. An SSE-triggered 404 reports gone", async () => {
  const task = addTask("sse-missing", "PX-133", "Implement");
  setRuns(task.id, [makeRun(63, "running")]);
  const lease = await takeLease(task);
  process.env.MAYA_TICK_POLL_MS = "60000";
  const watching = watchTask({ taskId: task.id, token: lease.lease.token, maxSeconds: 5, seen: "working" });
  await context.fake.sseConnected();
  context.tasks.splice(context.tasks.indexOf(task), 1);
  context.fake.emit(`Task ${task.id} changed`);
  assert.equal((await watching).event, "gone");
});

test("20. A wrong token returns lost before any API mutation", async () => {
  const task = addTask("lease-wrong", "PX-140", "Implement");
  const lease = await takeLease(task);
  const before = context.fake.requests.length;
  const result = await watchTask({ taskId: task.id, token: randomUUID(), maxSeconds: 2 });
  assert.equal(result.event, "lost");
  assert.deepEqual(context.fake.requests.slice(before), []);
});

test("20. Watch heartbeats its lease while waiting", async () => {
  const task = addTask("lease-heartbeat", "PX-141", "Implement");
  setRuns(task.id, [makeRun(70, "running")]);
  const lease = await takeLease(task);
  const before = Date.parse(readLease(task.id).lease.heartbeatAt);
  process.env.MAYA_TICK_HEARTBEAT_MS = "200";
  process.env.MAYA_TICK_POLL_MS = "60000";
  const result = await watchTask({ taskId: task.id, token: lease.lease.token, maxSeconds: 1, seen: "working" });
  assert.equal(result.event, "timeout");
  assert.ok(Date.parse(readLease(task.id).lease.heartbeatAt) > before);
});

test("20. Replacing a lease token during watch returns lost", async () => {
  const task = addTask("lease-replaced", "PX-142", "Implement");
  setRuns(task.id, [makeRun(71, "running")]);
  const lease = await takeLease(task);
  process.env.MAYA_TICK_HEARTBEAT_MS = "150";
  process.env.MAYA_TICK_POLL_MS = "60000";
  const watching = watchTask({ taskId: task.id, token: lease.lease.token, maxSeconds: 3, seen: "working" });
  await waitFor(() => context.fake.requests.some((request) => request.path === `/api/tasks/${task.id}`));
  await sleep(30);
  const current = readLease(task.id).lease;
  writeFileSync(join(context.directory, `${task.id}.json`), JSON.stringify({ ...current, token: randomUUID() }));
  const result = await watching;
  assert.equal(result.event, "lost");
});

test("21. End to end: claim, start, observe the next stage, and release", async () => {
  const task = addTask("e2e", "PX-150", "Backlog", { tags: ["process"] });
  const claim = await claimTask();
  assert.equal(claim.taskId, task.id);
  assert.ok(task.tags.includes("watched"));
  const started = await watchTask({ taskId: task.id, token: claim.token, maxSeconds: 2 });
  assert.equal(started.event, "acted");
  assert.equal(started.action, "started");
  const advanced = await watchTask({ taskId: task.id, token: claim.token, maxSeconds: 2 });
  assert.equal(advanced.event, "advanced");
  assert.equal(advanced.from, "Backlog");
  assert.equal(advanced.to, "Plan");
  const released = await releaseTask(task.id, claim.token);
  assert.equal(released.released, true);
  assert.equal(readLease(task.id).kind, "none");
  assert.deepEqual(task.tags, ["process"]);
  assert.equal(context.fake.forbiddenRequests.length, 0);
});

test("22. Status reports a closed Agentify API with exit code 1", async () => {
  const { result, code } = await runCli(["status"], { AGENTIFY_API: "http://127.0.0.1:1/api" });
  assert.equal(code, 1);
  assert.equal(result.agentifyDown, true);
  assert.match(result.error, /fetch failed|ECONNREFUSED/i);
});

test("22. A reachable API with no Maya Build workflow reports the setup instruction", async () => {
  context.workflows.splice(0);
  await assert.rejects(status(), /Maya Build workflow is missing.*setup-workflow\.mjs/);
});

test("23. Tick API requests are limited to the D4 adapter routes and permitted mutations", async () => {
  const task = addTask("audit", "PX-160", "Backlog");
  const noOrigin = await fetch(`${context.fake.url}/workflows`);
  assert.equal(noOrigin.status, 403);
  const wrongOrigin = await fetch(`${context.fake.url}/workflows`, { headers: { Origin: "http://example.invalid" } });
  assert.equal(wrongOrigin.status, 403);
  const claim = await claimTask();
  await watchTask({ taskId: task.id, token: claim.token, maxSeconds: 2 });
  await releaseTask(task.id, claim.token);
  assert.deepEqual(context.fake.forbiddenRequests, []);
  for (const request of context.fake.requests) {
    if (request.method === "PATCH") {
      assert.match(request.path, /^\/api\/tasks\/[^/]+$/);
      assert.deepEqual(Object.keys(request.body), ["tags"]);
    } else if (request.method === "POST") {
      assert.ok(request.path.endsWith("/move") || /\/runs\/[^/]+\/retry$/.test(request.path));
      if (request.path.endsWith("/move")) assert.deepEqual(request.body, { stageId: stageId("Plan"), runActions: true });
      else assert.deepEqual(request.body, {});
    } else {
      assert.equal(request.method, "GET");
      assert.match(request.path, /^\/api\/(workflows|tasks|events|runs\/[^/]+\/log)/);
      if (/\/artifact\?/.test(request.path)) assert.match(request.path, /^\/api\/tasks\/[^/]+\/artifact\?name=/);
    }
  }
});
