import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, test } from "node:test";
import { createFakeAgentify } from "./fake-agentify.mjs";
import * as claims from "../claims.mjs";

const moduleUrl = pathToFileURL(fileURLToPath(new URL("../claims.mjs", import.meta.url))).href;
const worktreeRoot = fileURLToPath(new URL("../../../", import.meta.url));
const ENV_KEYS = ["AGENTIFY_API", "MAYA_CLAIMS_DIR", "MAYA_CLAIMS_TEST_BARRIER", "MAYA_CLAIMS_TEST_HOLD_MS", "MAYA_CLAIMS_TEST_LOCK_WAIT_MS"];
let context;

beforeEach(async () => {
  const saved = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
  const directory = mkdtempSync(join(worktreeRoot, ".maya-claims-test-"));
  const fake = await createFakeAgentify();
  process.env.AGENTIFY_API = fake.url;
  process.env.MAYA_CLAIMS_DIR = directory;
  delete process.env.MAYA_CLAIMS_TEST_BARRIER;
  delete process.env.MAYA_CLAIMS_TEST_HOLD_MS;
  delete process.env.MAYA_CLAIMS_TEST_LOCK_WAIT_MS;
  context = { saved, directory, fake };
});

afterEach(async () => {
  await context.fake.close();
  rmSync(context.directory, { recursive: true, force: true });
  for (const [key, value] of context.saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(10);
  }
  assert.fail("Timed out waiting for child-process condition");
}

function spawnJson(source, env, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", source], { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`Child exited ${code ?? signal}: ${stderr}\n${stdout}`));
      try { resolve(JSON.parse(stdout.trim())); } catch (error) { reject(new Error(`Invalid child JSON: ${stdout}\n${stderr}`, { cause: error })); }
    });
  });
}

function seedLease(taskId, token, expiresAt = new Date(Date.now() - 1_000).toISOString()) {
  const now = new Date(Date.now() - 20_000).toISOString();
  const lease = {
    token,
    holder: "old-chat",
    taskId,
    title: `[PX-01] ${taskId}`,
    stageId: "stage-review",
    stageName: "Review",
    claimedAt: now,
    heartbeatAt: now,
    expiresAt,
    retried: [],
  };
  writeFileSync(join(context.directory, `${taskId}.json`), JSON.stringify(lease), { flag: "wx" });
  return lease;
}

function staleMtime(path, minutes = 3) {
  const old = new Date(Date.now() - minutes * 60_000);
  utimesSync(path, old, old);
}

const acquireSource = `
import { writeFileSync } from "node:fs";
writeFileSync(process.env.READY_FILE, "ready");
const claims = await import(process.env.CLAIMS_MODULE);
const result = await claims.tryAcquire({ taskId: process.env.TASK_ID, title: "[PX-01] race", stageId: "stage-review", stageName: "Review", holder: process.env.HOLDER });
process.stdout.write(JSON.stringify(result));
`;

async function barrierChildren(taskId, count, round) {
  const barrier = join(context.directory, `barrier-${round}`);
  const readyBase = join(context.directory, `ready-${round}`);
  const children = Array.from({ length: count }, (_, index) => {
    const readyFile = `${readyBase}-${index}`;
    const env = {
      ...process.env,
      TASK_ID: taskId,
      HOLDER: `child-${index}`,
      CLAIMS_MODULE: moduleUrl,
      READY_FILE: readyFile,
      MAYA_CLAIMS_TEST_BARRIER: barrier,
    };
    return { readyFile, promise: spawnJson(acquireSource, env) };
  });
  await waitFor(() => children.every(({ readyFile }) => existsSync(readyFile)));
  writeFileSync(barrier, "go");
  return Promise.all(children.map(({ promise }) => promise));
}

function lockChildSource() {
  return `
import { appendFileSync, writeFileSync } from "node:fs";
writeFileSync(process.env.READY_FILE, "ready");
const claims = await import(process.env.CLAIMS_MODULE);
const result = await claims.withLock(process.env.LOCK_NAME, async () => {
  appendFileSync(process.env.LOG_FILE, JSON.stringify({ event: "enter", pid: process.pid, at: Date.now() }) + "\\n");
  await new Promise((resolve) => setTimeout(resolve, 40));
  appendFileSync(process.env.LOG_FILE, JSON.stringify({ event: "exit", pid: process.pid, at: Date.now() }) + "\\n");
});
process.stdout.write(JSON.stringify(result));
`;
}

async function runLockChildren(lockName, count, round) {
  const barrier = join(context.directory, `lock-barrier-${round}`);
  const logPath = join(context.directory, `lock-log-${round}.jsonl`);
  const children = Array.from({ length: count }, (_, index) => {
    const readyFile = join(context.directory, `lock-ready-${round}-${index}`);
    const env = {
      ...process.env,
      CLAIMS_MODULE: moduleUrl,
      LOCK_NAME: lockName,
      LOG_FILE: logPath,
      READY_FILE: readyFile,
      MAYA_CLAIMS_TEST_BARRIER: barrier,
      MAYA_CLAIMS_TEST_HOLD_MS: "120",
    };
    return { readyFile, promise: spawnJson(lockChildSource(), env) };
  });
  await waitFor(() => children.every(({ readyFile }) => existsSync(readyFile)));
  writeFileSync(barrier, "go");
  const results = await Promise.all(children.map(({ promise }) => promise));
  return { results, logPath };
}

test("1. Concurrent fresh acquire: exactly one winner over ten eight-child rounds", async () => {
  for (let round = 0; round < 10; round++) {
    const taskId = `PX01_fresh_${round}`;
    const results = await barrierChildren(taskId, 8, round);
    const winners = results.filter((result) => result.status === "ok");
    assert.equal(winners.length, 1);
    assert.ok(results.every((result) => ["ok", "held", "busy"].includes(result.status)));
    const lease = claims.readLease(taskId);
    assert.equal(lease.kind, "live");
    assert.equal(lease.lease.token, winners[0].lease.token);
    assert.equal(readdirSync(context.directory).filter((name) => name === `${taskId}.json`).length, 1);
  }
});

test("2. Concurrent stale takeover: exactly one winner over ten eight-child rounds", async () => {
  for (let round = 0; round < 10; round++) {
    const taskId = `PX01_stale_${round}`;
    seedLease(taskId, randomUUID());
    const results = await barrierChildren(taskId, 8, 100 + round);
    const winners = results.filter((result) => result.status === "ok");
    assert.equal(winners.length, 1);
    assert.ok(results.every((result) => ["ok", "held", "busy"].includes(result.status)));
    const lease = claims.readLease(taskId);
    assert.equal(lease.kind, "live");
    assert.equal(lease.lease.token, winners[0].lease.token);
    assert.equal(readdirSync(context.directory).filter((name) => name === `${taskId}.json`).length, 1);
  }
});

test("3. Forced interleave: a second stale takeover cannot win during the first lock holder", async () => {
  const taskId = "PX01_interleave";
  seedLease(taskId, randomUUID());
  const first = spawnJson(acquireSource, {
    ...process.env,
    TASK_ID: taskId,
    HOLDER: "first",
    CLAIMS_MODULE: moduleUrl,
    READY_FILE: join(context.directory, "first-ready"),
    MAYA_CLAIMS_TEST_HOLD_MS: "500",
  });
  await waitFor(() => existsSync(join(context.directory, `${taskId}.json`)) && readdirSync(context.directory).some((name) => name.startsWith(`${taskId}.`) && name.includes(".lock.")));
  const second = spawnJson(acquireSource, {
    ...process.env,
    TASK_ID: taskId,
    HOLDER: "second",
    CLAIMS_MODULE: moduleUrl,
    READY_FILE: join(context.directory, "second-ready"),
    MAYA_CLAIMS_TEST_LOCK_WAIT_MS: "800",
  });
  const [one, two] = await Promise.all([first, second]);
  assert.equal(one.status, "ok");
  assert.notEqual(two.status, "ok");
  assert.equal(claims.readLease(taskId).lease.token, one.lease.token);
});

test("4. Abandoned generation locks stay mutually exclusive and fresh locks time out", async () => {
  for (const [round, name, stalePath] of [
    [1, "_start", join(context.directory, "_start.lock.0")],
    [2, "PX01.unreadable", join(context.directory, "PX01.unreadable.lock.0")],
  ]) {
    mkdirSync(stalePath);
    staleMtime(stalePath);
    const { results, logPath } = await runLockChildren(name, 4, round);
    assert.ok(results.every((result) => result.kind === "ok"));
    const lines = readFileSync(logPath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    let inside = null;
    for (const line of lines) {
      if (line.event === "enter") {
        assert.equal(inside, null, "critical-section intervals overlapped");
        inside = line.pid;
      } else {
        assert.equal(line.event, "exit");
        assert.equal(line.pid, inside);
        inside = null;
      }
    }
    assert.equal(inside, null);
    assert.ok(existsSync(stalePath), "a chat must not remove another generation's abandoned lock");
    const lockDirs = readdirSync(context.directory).filter((entry) => entry.startsWith(`${name}.lock.`));
    assert.deepEqual(lockDirs, [`${name}.lock.0`]);
  }

  const fresh = join(context.directory, "_start.lock.0");
  if (!existsSync(fresh)) mkdirSync(fresh);
  const now = new Date();
  utimesSync(fresh, now, now);
  process.env.MAYA_CLAIMS_TEST_LOCK_WAIT_MS = "200";
  assert.deepEqual(await claims.withLock("_start", () => "unexpected"), { kind: "busy" });

  const taskId = "PX01_oldgen";
  const oldToken = randomUUID();
  seedLease(taskId, oldToken);
  const oldLock = join(context.directory, `${taskId}.${oldToken}.lock.0`);
  mkdirSync(oldLock);
  staleMtime(oldLock);
  const ready = join(context.directory, "takeover-ready");
  const child = spawnJson(acquireSource, {
    ...process.env,
    TASK_ID: taskId,
    HOLDER: "takeover",
    CLAIMS_MODULE: moduleUrl,
    READY_FILE: ready,
    MAYA_CLAIMS_TEST_HOLD_MS: "250",
  });
  await waitFor(() => existsSync(ready));
  const nextLock = join(context.directory, `${taskId}.${oldToken}.lock.1`);
  await waitFor(() => existsSync(nextLock));
  const takeover = await child;
  assert.equal(takeover.status, "ok");
  assert.notEqual(takeover.lease.token, oldToken);
  assert.equal(existsSync(oldLock), false);
});

test("5. Dead-generation cleanup removes only locks whose generation is provably dead", async () => {
  const liveTask = "PX01_live";
  const liveToken = randomUUID();
  const live = { ...seedLease(liveTask, liveToken, new Date(Date.now() + 60_000).toISOString()), expiresAt: new Date(Date.now() + 60_000).toISOString() };
  writeFileSync(join(context.directory, `${liveTask}.json`), JSON.stringify(live));
  const liveLock = join(context.directory, `${liveTask}.${liveToken}.lock.0`);
  const deadLock = join(context.directory, `${liveTask}.${randomUUID()}.lock.0`);
  mkdirSync(liveLock);
  mkdirSync(deadLock);

  const missingLock = join(context.directory, `PX01_missing.${randomUUID()}.lock.0`);
  mkdirSync(missingLock);
  const unreadableTask = "PX01_corrupt";
  const unreadableToken = randomUUID();
  writeFileSync(join(context.directory, `${unreadableTask}.json`), "{");
  const corruptLock = join(context.directory, `${unreadableTask}.${unreadableToken}.lock.0`);
  const sharedLock = join(context.directory, "_start.lock.0");
  const unreadableLock = join(context.directory, `${unreadableTask}.unreadable.lock.0`);
  mkdirSync(corruptLock);
  mkdirSync(sharedLock);
  mkdirSync(unreadableLock);
  const staleTemp = join(context.directory, "PX01_stale.json.token.tmp");
  const freshTemp = join(context.directory, "PX01_fresh.json.token.tmp");
  writeFileSync(staleTemp, "old temp");
  writeFileSync(freshTemp, "fresh temp");
  staleMtime(staleTemp, 11);

  const result = claims.cleanupLocks();
  assert.ok(result.cleaned >= 3);
  assert.ok(existsSync(liveLock));
  assert.ok(!existsSync(deadLock));
  assert.ok(!existsSync(missingLock));
  assert.ok(existsSync(corruptLock));
  assert.ok(existsSync(sharedLock));
  assert.ok(existsSync(unreadableLock));
  assert.ok(!existsSync(staleTemp));
  assert.ok(existsSync(freshTemp));

  const released = await claims.tryAcquire({ taskId: "PX01_released", title: "released", stageId: "s", stageName: "Plan" });
  const releasedLock = join(context.directory, `PX01_released.${released.lease.token}.lock.0`);
  mkdirSync(releasedLock);
  staleMtime(releasedLock);
  assert.equal((await claims.release("PX01_released", released.lease.token)).status, "ok");
  assert.ok(!existsSync(releasedLock));
});

test("6. Heartbeat requires its token, extends live leases, rejects expired leases, and records retries", async () => {
  const taskId = "PX01_heartbeat";
  const acquired = await claims.tryAcquire({ taskId, title: "heartbeat", stageId: "review-id", stageName: "Review" });
  assert.equal(acquired.status, "ok");
  const path = join(context.directory, `${taskId}.json`);
  const beforeWrong = readFileSync(path, "utf8");
  assert.equal((await claims.heartbeat(taskId, randomUUID())).status, "lost");
  assert.equal(readFileSync(path, "utf8"), beforeWrong);

  const oldExpiry = Date.parse(claims.readLease(taskId).lease.expiresAt);
  await sleep(10);
  const first = await claims.heartbeat(taskId, acquired.lease.token);
  assert.equal(first.status, "ok");
  assert.ok(Date.parse(first.lease.expiresAt) > oldExpiry);
  assert.equal(first.lease.stageId, "review-id");

  const withRetry = await claims.heartbeat(taskId, acquired.lease.token, { addRetried: "run-7" });
  assert.equal(withRetry.status, "ok");
  const withSecond = await claims.heartbeat(taskId, acquired.lease.token, { addRetried: 8 });
  assert.deepEqual(withSecond.lease.retried, ["run-7", 8]);

  const expired = { ...withSecond.lease, expiresAt: new Date(Date.now() - 1).toISOString() };
  writeFileSync(path, JSON.stringify(expired));
  const beforeExpired = readFileSync(path, "utf8");
  assert.equal((await claims.heartbeat(taskId, acquired.lease.token)).status, "lost");
  assert.equal(readFileSync(path, "utf8"), beforeExpired);
});

test("7. Release requires the matching token and removes only its own lease", async () => {
  const taskId = "PX01_release";
  const acquired = await claims.tryAcquire({ taskId, title: "release", stageId: "plan-id", stageName: "Plan" });
  const path = join(context.directory, `${taskId}.json`);
  const original = readFileSync(path, "utf8");
  assert.equal((await claims.release(taskId, randomUUID())).status, "not-held");
  assert.equal(readFileSync(path, "utf8"), original);
  assert.equal((await claims.release(taskId, acquired.lease.token)).status, "ok");
  assert.equal(claims.readLease(taskId).kind, "none");
});

test("8. Young unreadable leases are held and old unreadable leases can be taken over", async () => {
  const taskId = "PX01_unreadable";
  const path = join(context.directory, `${taskId}.json`);
  writeFileSync(path, "{");
  assert.equal(claims.readLease(taskId).kind, "unreadable");
  assert.equal((await claims.tryAcquire({ taskId, title: "young", stageId: "s", stageName: "Plan" })).status, "held");
  staleMtime(path, 11);
  const result = await claims.tryAcquire({ taskId, title: "old", stageId: "s", stageName: "Plan" });
  assert.equal(result.status, "ok");
  assert.equal(result.tookOver, true);
  assert.equal(claims.readLease(taskId).lease.token, result.lease.token);
});

test("9. Invalid task ids and tokens throw before filesystem access", async () => {
  const missingDir = join(context.directory, "must-not-be-created");
  process.env.MAYA_CLAIMS_DIR = missingDir;
  await assert.rejects(claims.tryAcquire({ taskId: "../escape", title: "bad" }), /Invalid task id/);
  await assert.rejects(claims.heartbeat("PX01", "not-a-uuid"), /Invalid lease token/);
  await assert.rejects(claims.release("../escape", randomUUID()), /Invalid task id/);
  assert.equal(existsSync(missingDir), false);
});
