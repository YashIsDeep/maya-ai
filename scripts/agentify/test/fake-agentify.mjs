// Small in-memory Agentify API for tick tests. It implements only the tick adapter's routes.
import { createServer } from "node:http";

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function sendJson(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function bodyText(value) {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export async function createFakeAgentify({
  workflows = [],
  tasks = [],
  details = {},
  artifacts = {},
  suppressRetryRun = false,
} = {}) {
  const taskRows = tasks;
  const detailRows = new Map(Object.entries(details));
  const artifactRows = new Map(Object.entries(artifacts));
  const requests = [];
  const forbiddenRequests = [];
  const sseClients = new Set();
  const connected = deferred();
  let moveFailure = null;
  let retryFailure = null;
  let shouldCreateRetryRun = !suppressRetryRun;
  let port;

  function detailFor(id) {
    let detail = detailRows.get(String(id));
    if (!detail) {
      const task = taskRows.find((item) => String(item.id) === String(id));
      if (!task) return null;
      detail = { task, visits: [], timeline: [] };
      detailRows.set(String(id), detail);
    }
    const task = taskRows.find((item) => String(item.id) === String(id));
    if (task && detail.task !== task) detail.task = task;
    return detail;
  }

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, `http://127.0.0.1:${port ?? 0}`);
    const pathname = url.pathname.replace(/^\/api/, "");
    const entry = { method: request.method, path: url.pathname + url.search, body: null };
    const expectedOrigin = `http://127.0.0.1:${port}`;
    if (request.method === "DELETE" || /\/(approve|send-back|request-changes|skip|cancel|resume)$/.test(pathname) || /\/questions\/[^/]+\/answer$/.test(pathname)) {
      try { if (request.method !== "GET") entry.body = await readJson(request); } catch { /* forbidden body need not parse */ }
      forbiddenRequests.push(entry);
      requests.push(entry);
      sendJson(response, 500, { error: "Forbidden test route" });
      return;
    }
    if (request.headers.origin !== expectedOrigin) {
      requests.push(entry);
      sendJson(response, 403, { error: "Origin denied" });
      return;
    }

    try {
      if (request.method === "GET" && pathname === "/workflows") {
        requests.push(entry);
        sendJson(response, 200, workflows);
        return;
      }
      if (request.method === "GET" && pathname === "/tasks") {
        const status = url.searchParams.get("status");
        const selected = status ? taskRows.filter((task) => task.status === status) : taskRows;
        requests.push(entry);
        sendJson(response, 200, selected);
        return;
      }
      if (request.method === "GET" && pathname === "/events") {
        requests.push(entry);
        response.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        response.write("event: ready\ndata: \n\n");
        sseClients.add(response);
        connected.resolve();
        request.on("close", () => sseClients.delete(response));
        return;
      }

      const taskMatch = /^\/tasks\/([^/]+)(\/artifacts|\/artifact|\/move)?$/.exec(pathname);
      if (taskMatch) {
        const id = decodeURIComponent(taskMatch[1]);
        const suffix = taskMatch[2] ?? "";
        const task = taskRows.find((item) => String(item.id) === id);
        if (!task) {
          requests.push(entry);
          sendJson(response, 404, { error: "Task not found" });
          return;
        }
        if (request.method === "GET" && suffix === "") {
          requests.push(entry);
          sendJson(response, 200, detailFor(id));
          return;
        }
        if (request.method === "GET" && suffix === "/artifacts") {
          requests.push(entry);
          const set = artifactRows.get(id) ?? {};
          const rows = Object.entries(set).map(([name, text]) => ({ name, size: bodyText(text).length, modifiedAt: Date.now() }));
          sendJson(response, 200, rows);
          return;
        }
        if (request.method === "GET" && suffix === "/artifact") {
          const name = url.searchParams.get("name");
          requests.push(entry);
          const value = artifactRows.get(id)?.[name];
          if (value === undefined) { sendJson(response, 404, { error: "Artifact not found" }); return; }
          response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
          response.end(bodyText(value));
          return;
        }
        if (request.method === "PATCH" && suffix === "") {
          entry.body = await readJson(request);
          requests.push(entry);
          if (Array.isArray(entry.body.tags)) task.tags = entry.body.tags;
          sendJson(response, 200, detailFor(id));
          return;
        }
        if (request.method === "POST" && suffix === "/move") {
          entry.body = await readJson(request);
          requests.push(entry);
          if (moveFailure) { sendJson(response, moveFailure.status, { error: moveFailure.message }); return; }
          task.currentStageId = entry.body.stageId;
          const detail = detailFor(id);
          detail.task.currentStageId = entry.body.stageId;
          sendJson(response, 200, detail);
          return;
        }
      }

      const retryMatch = /^\/runs\/([^/]+)\/retry$/.exec(pathname);
      if (request.method === "POST" && retryMatch) {
        entry.body = await readJson(request);
        requests.push(entry);
        if (retryFailure) { sendJson(response, retryFailure.status, { error: retryFailure.message }); return; }
        if (shouldCreateRetryRun) {
          const parentId = Number(decodeURIComponent(retryMatch[1]));
          for (const detail of detailRows.values()) {
            for (const visit of detail.visits ?? []) {
              const parent = (visit.runs ?? []).find((run) => run.id === parentId);
              if (!parent) continue;
              const id = Math.max(0, ...[...detailRows.values()].flatMap((item) => (item.visits ?? []).flatMap((v) => (v.runs ?? []).map((run) => Number(run.id) || 0)))) + 1;
              visit.runs.push({ ...parent, id, status: "queued", retryOfRunId: parentId, error: null, question: null });
              break;
            }
          }
        }
        sendJson(response, 200, { ok: true });
        return;
      }

      requests.push(entry);
      sendJson(response, 404, { error: "Route not found" });
    } catch (error) {
      requests.push(entry);
      sendJson(response, 500, { error: error.message });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      port = server.address().port;
      resolve();
    });
  });

  return {
    url: `http://127.0.0.1:${port}/api`,
    origin: `http://127.0.0.1:${port}`,
    requests,
    forbiddenRequests,
    sseConnected: () => connected.promise,
    emit(data) {
      const text = typeof data === "string" ? data : JSON.stringify(data);
      for (const client of sseClients) client.write(`event: task.changed\ndata: ${text}\n\n`);
    },
    setMoveFailure(status, message = "move failed") { moveFailure = { status, message }; },
    setRetryFailure(status, message = "retry failed") { retryFailure = { status, message }; },
    setCreateRetryRun(value) { shouldCreateRetryRun = value; },
    setTask(id, patch) {
      const task = taskRows.find((item) => String(item.id) === String(id));
      if (task) Object.assign(task, patch);
    },
    setArtifact(id, name, value) {
      if (!artifactRows.has(String(id))) artifactRows.set(String(id), {});
      artifactRows.get(String(id))[name] = value;
    },
    detailFor,
    async close() {
      for (const client of sseClients) client.end();
      sseClients.clear();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
