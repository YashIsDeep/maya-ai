// Shared atomic claims for agentify-tick. Every chat on this machine uses the same claims folder.
// 1. creates leases with exclusive-create (wx), so only one chat can acquire a task;
// 2. takes over expired leases, heartbeats, and releases under a lock for that lease generation;
// 3. keeps tokens as the capability for changing a lease, and cleans only dead generations.
// Refuses unsafe or contended operations rather than guessing about ownership.
import { randomBytes, randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const TTL_MS = 10 * 60_000;
export const LOCK_ABANDON_MS = 2 * 60_000;
const LOCK_WAIT_MS = 5_000;
const FS_RETRIES = 10;
const FS_RETRY_MS = 50;
const BUSY = Symbol("busy filesystem operation");
const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TASK_ID_RE = /^[A-Za-z0-9_-]{1,100}$/;

function sleepSync(ms) {
  if (ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function validateTaskId(taskId) {
  if (typeof taskId !== "string" || !TASK_ID_RE.test(taskId)) throw new TypeError("Invalid task id");
  return taskId;
}

export function validateToken(token) {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) throw new TypeError("Invalid lease token");
  return token;
}

export function validateHolder(holder) {
  if (typeof holder !== "string" || holder.length > 64 || /\p{C}/u.test(holder)) {
    throw new TypeError("Holder must be at most 64 printable characters");
  }
  return holder;
}

/** Retry Windows delete-pending and sharing errors; the caller handles the BUSY sentinel. */
export function retryFs(fn) {
  for (let retry = 0; ; retry++) {
    try {
      return fn();
    } catch (error) {
      if (!["EPERM", "EBUSY", "EACCES"].includes(error?.code)) throw error;
      if (retry >= FS_RETRIES) return BUSY;
      sleepSync(FS_RETRY_MS);
    }
  }
}

export function claimsDir() {
  return process.env.MAYA_CLAIMS_DIR ?? join(homedir(), ".workflow-manager", "maya-claims");
}

function ensureClaimsDir() {
  return retryFs(() => mkdirSync(claimsDir(), { recursive: true }));
}

function leasePath(taskId) {
  validateTaskId(taskId);
  return join(claimsDir(), `${taskId}.json`);
}

function parseLease(value, taskId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (
    !TOKEN_RE.test(value.token ?? "") || value.taskId !== taskId || typeof value.holder !== "string" ||
    typeof value.title !== "string" || typeof value.stageId !== "string" || typeof value.stageName !== "string" ||
    !Number.isFinite(Date.parse(value.claimedAt)) || !Number.isFinite(Date.parse(value.heartbeatAt)) ||
    !Number.isFinite(Date.parse(value.expiresAt)) || !Array.isArray(value.retried)
  ) return null;
  return value;
}

function mtimeOf(path) {
  const stat = retryFs(() => statSync(path));
  return stat === BUSY ? BUSY : stat.mtimeMs;
}

/** Return none/live/expired/unreadable (or busy when Windows denies access after retries). */
export function readLease(taskId, now = Date.now()) {
  validateTaskId(taskId);
  if (ensureClaimsDir() === BUSY) return { kind: "busy" };
  const path = leasePath(taskId);
  let source;
  try {
    source = retryFs(() => readFileSync(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return { kind: "none" };
    throw error;
  }
  if (source === BUSY) return { kind: "busy" };
  let parsed;
  try {
    parsed = parseLease(JSON.parse(source), taskId);
  } catch {
    parsed = null;
  }
  if (parsed) return { kind: Date.parse(parsed.expiresAt) > now ? "live" : "expired", lease: parsed };
  let mtimeMs;
  try {
    mtimeMs = mtimeOf(path);
  } catch (error) {
    if (error?.code === "ENOENT") return { kind: "none" };
    throw error;
  }
  if (mtimeMs === BUSY) return { kind: "busy" };
  return { kind: "unreadable", mtimeMs };
}

export function leaseIsLive(result, now = Date.now()) {
  return result.kind === "live" || result.kind === "busy" || (result.kind === "unreadable" && now - result.mtimeMs <= TTL_MS);
}

function lockNameValid(name) {
  if (name === "_start") return true;
  const unreadable = /^([A-Za-z0-9_-]{1,100})\.unreadable$/;
  const generation = /^([A-Za-z0-9_-]{1,100})\.([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
  return unreadable.test(name) || generation.test(name);
}

async function testBarrier() {
  const path = process.env.MAYA_CLAIMS_TEST_BARRIER;
  if (!path) return;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      if (retryFs(() => statSync(path)) !== BUSY) return;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await sleep(5);
  }
  throw new Error("Timed out waiting for the claims test barrier");
}

function lockDirectories(name) {
  const entries = retryFs(() => readdirSync(claimsDir(), { withFileTypes: true }));
  if (entries === BUSY) return BUSY;
  const prefix = `${name}.lock.`;
  const locks = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(prefix)) continue;
    const number = Number(entry.name.slice(prefix.length));
    if (!Number.isSafeInteger(number) || number < 0 || !/^\d+$/.test(entry.name.slice(prefix.length))) continue;
    const path = join(claimsDir(), entry.name);
    let mtimeMs;
    try {
      mtimeMs = mtimeOf(path);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    if (mtimeMs === BUSY) return BUSY;
    locks.push({ number, path, mtimeMs });
  }
  return locks;
}

/** Atomic mkdir lock with monotonically increasing generations; each holder removes only its own. */
export async function withLock(name, fn) {
  if (typeof name !== "string" || !lockNameValid(name)) throw new TypeError("Invalid lock name");
  if (typeof fn !== "function") throw new TypeError("Lock callback must be a function");
  await testBarrier();
  if (ensureClaimsDir() === BUSY) return { kind: "busy" };
  const configured = Number(process.env.MAYA_CLAIMS_TEST_LOCK_WAIT_MS);
  const waitMs = Number.isFinite(configured) && configured >= 0 ? configured : LOCK_WAIT_MS;
  const deadline = Date.now() + waitMs;
  let mine;

  while (Date.now() <= deadline) {
    const existing = lockDirectories(name);
    if (existing === BUSY) {
      await sleep(25);
      continue;
    }
    existing.sort((a, b) => a.number - b.number);
    const highest = existing.at(-1);
    const number = highest ? highest.number + 1 : 0;
    if (highest && Date.now() - highest.mtimeMs <= LOCK_ABANDON_MS) {
      await sleep(25);
      continue;
    }
    const path = join(claimsDir(), `${name}.lock.${number}`);
    let result;
    try {
      result = retryFs(() => mkdirSync(path));
    } catch (error) {
      if (error?.code === "EEXIST") continue;
      throw error;
    }
    if (result === BUSY) {
      await sleep(25);
      continue;
    }
    mine = path;
    break;
  }
  if (!mine) return { kind: "busy" };

  try {
    const holdMs = Number(process.env.MAYA_CLAIMS_TEST_HOLD_MS);
    if (Number.isFinite(holdMs) && holdMs > 0) sleepSync(holdMs);
    return { kind: "ok", value: await fn() };
  } finally {
    try {
      const removed = retryFs(() => rmdirSync(mine));
      if (removed === BUSY) throw new Error(`Could not release lock ${name}`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

function makeLease(info) {
  const now = new Date().toISOString();
  const holder = info.holder ?? `chat-${randomBytes(4).toString("hex")}`;
  validateHolder(holder);
  return {
    token: randomUUID(),
    holder,
    taskId: info.taskId,
    title: String(info.title ?? ""),
    stageId: String(info.stageId ?? ""),
    stageName: String(info.stageName ?? ""),
    claimedAt: now,
    heartbeatAt: now,
    expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
    retried: [],
  };
}

function writeNewLease(lease) {
  const result = retryFs(() => writeFileSync(leasePath(lease.taskId), JSON.stringify(lease), { flag: "wx" }));
  if (result === BUSY) return { status: "busy" };
  return { status: "ok", lease };
}

function createLease(info, tookOver = false) {
  const lease = makeLease(info);
  const result = writeNewLease(lease);
  return result.status === "ok" ? { ...result, tookOver } : result;
}

/** Create a lease or take over the exact expired generation while holding its lock. */
export async function tryAcquire(info) {
  if (!info || typeof info !== "object") throw new TypeError("Lease information is required");
  validateTaskId(info.taskId);
  if (info.holder !== undefined) validateHolder(info.holder);
  await testBarrier();
  if (ensureClaimsDir() === BUSY) return { status: "busy" };
  let initial;
  try {
    const result = createLease(info, false);
    if (result.status === "ok") return result;
    if (result.status === "busy") return result;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }

  initial = readLease(info.taskId);
  if (initial.kind === "busy") return { status: "busy" };
  if (initial.kind === "none") {
    try {
      const result = createLease(info, false);
      if (result.status === "ok" || result.status === "busy") return result;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    return { status: "held" };
  }
  if (initial.kind === "live" || (initial.kind === "unreadable" && Date.now() - initial.mtimeMs <= TTL_MS)) {
    return { status: "held" };
  }

  const oldToken = initial.lease?.token ?? null;
  const generationName = oldToken ? `${info.taskId}.${oldToken}` : `${info.taskId}.unreadable`;
  const locked = await withLock(generationName, () => {
    const current = readLease(info.taskId);
    if (current.kind === "busy") return { status: "busy" };
    const sameExpired = oldToken
      ? current.kind === "expired" && current.lease.token === oldToken
      : current.kind === "unreadable" && current.mtimeMs === initial.mtimeMs && Date.now() - current.mtimeMs > TTL_MS;
    if (!sameExpired) return { status: "held" };

    const removed = retryFs(() => unlinkSync(leasePath(info.taskId)));
    if (removed === BUSY) return { status: "busy" };
    let replacement;
    try {
      replacement = createLease(info, true);
    } catch (error) {
      if (error?.code === "EEXIST") return { status: "held" };
      throw error;
    }
    if (replacement.status === "ok") replacement.oldToken = oldToken;
    return replacement.status === "ok" ? replacement : replacement.status === "busy" ? replacement : { status: "held" };
  });
  if (locked.kind === "busy") return { status: "busy" };
  const result = locked.value;
  if (result.status === "ok") cleanupLocks();
  return result;
}

/** Refresh only a matching, unexpired generation; optional retry ids survive later heartbeats. */
export async function heartbeat(taskId, token, { addRetried } = {}) {
  validateTaskId(taskId);
  validateToken(token);
  if (addRetried !== undefined && !(typeof addRetried === "string" || Number.isSafeInteger(addRetried))) {
    throw new TypeError("Invalid retried run id");
  }
  const locked = await withLock(`${taskId}.${token}`, () => {
    const current = readLease(taskId);
    if (current.kind === "busy") return { status: "busy" };
    if (current.kind !== "live" || current.lease.token !== token) return { status: "lost" };
    const now = new Date().toISOString();
    const retried = [...current.lease.retried];
    if (addRetried !== undefined && !retried.includes(addRetried)) retried.push(addRetried);
    const updated = {
      ...current.lease,
      heartbeatAt: now,
      expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
      retried,
    };
    const temp = `${leasePath(taskId)}.${token}.tmp`;
    const written = retryFs(() => writeFileSync(temp, JSON.stringify(updated)));
    if (written === BUSY) return { status: "busy" };
    const renamed = retryFs(() => renameSync(temp, leasePath(taskId)));
    if (renamed === BUSY) return { status: "busy" };
    return { status: "ok", lease: updated };
  });
  return locked.kind === "busy" ? { status: "busy" } : locked.value;
}

/** Remove only the lease whose token matches the caller. */
export async function release(taskId, token) {
  validateTaskId(taskId);
  validateToken(token);
  const locked = await withLock(`${taskId}.${token}`, () => {
    const current = readLease(taskId);
    if (current.kind === "busy") return { status: "busy" };
    if (!current.lease || current.lease.token !== token) return { status: "not-held" };
    const removed = retryFs(() => unlinkSync(leasePath(taskId)));
    if (removed === BUSY) return { status: "busy" };
    return { status: "ok" };
  });
  if (locked.kind === "busy") return { status: "busy" };
  const result = locked.value;
  if (result.status === "ok") cleanupLocks();
  return result;
}

/** Read every lease file; unreadable and expired files remain visible for cleanup/status. */
export function listLeases() {
  let entries;
  try {
    entries = retryFs(() => readdirSync(claimsDir(), { withFileTypes: true }));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  if (entries === BUSY) throw new Error("Claims directory is busy");
  return entries
    .filter((entry) => entry.isFile() && /^[A-Za-z0-9_-]{1,100}\.json$/.test(entry.name))
    .map((entry) => ({ taskId: entry.name.slice(0, -5), ...readLease(entry.name.slice(0, -5)) }));
}

/** Remove only dead token generations, never the shared start/unreadable locks, and stale temp files. */
export function cleanupLocks() {
  if (ensureClaimsDir() === BUSY) return { cleaned: 0, busy: true };
  const entries = retryFs(() => readdirSync(claimsDir(), { withFileTypes: true }));
  if (entries === BUSY) return { cleaned: 0, busy: true };
  let cleaned = 0;
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const match = /^([A-Za-z0-9_-]{1,100})\.([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.lock\.\d+$/i.exec(entry.name);
      if (!match) continue;
      const [, taskId, token] = match;
      const current = readLease(taskId);
      const dead = current.kind === "none" || (current.lease && current.lease.token !== token);
      if (!dead) continue;
      try {
        const removed = retryFs(() => rmdirSync(join(claimsDir(), entry.name)));
        if (removed !== BUSY) cleaned++;
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    } else if (entry.isFile() && entry.name.endsWith(".tmp")) {
      const path = join(claimsDir(), entry.name);
      let mtimeMs;
      try { mtimeMs = mtimeOf(path); }
      catch (error) { if (error?.code === "ENOENT") continue; throw error; }
      if (mtimeMs === BUSY || Date.now() - mtimeMs <= TTL_MS) continue;
      try {
        const removed = retryFs(() => unlinkSync(path));
        if (removed !== BUSY) cleaned++;
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  }
  return { cleaned, busy: false };
}

export const isBusy = (value) => value === BUSY;
