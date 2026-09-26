import test from "node:test";
import assert from "node:assert/strict";
import { checkResponse, chooseDefaultModel, loadKey, redact, renderReport, summarize } from "../lib.mjs";
import { costOf, ENVELOPE, MODELS, TARGET_USD_PER_TASK } from "../pricing.mjs";
import { referenceCalls, SYSTEM, TOOLS } from "../reference-task.mjs";

const closeTo = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be within ${tolerance} of ${expected}`);
};

test("costOf uses published model prices and cache rates", () => {
  closeTo(costOf("claude-sonnet-5", { input_tokens: 12000, output_tokens: 2000 }), 0.044);
  closeTo(costOf("claude-haiku-4-5-20251001", { input_tokens: 12000, output_tokens: 2000 }), 0.022);
  closeTo(
    costOf("claude-sonnet-5", {
      input_tokens: 12000,
      output_tokens: 2000,
      cache_creation_input_tokens: 1000,
      cache_read_input_tokens: 1000,
    }),
    0.0467,
  );
});

test("costOf refuses unpriced models", () => {
  assert.throws(
    () => costOf("claude-fable-5-1", { input_tokens: 1, output_tokens: 1 }),
    { message: "No price for model claude-fable-5-1" },
  );
});

test("reference request bodies contain all fixed settings and alternate message roles", () => {
  const calls = referenceCalls();
  assert.equal(calls.length, 3);
  for (const body of calls) {
    assert.equal(body.system, SYSTEM);
    assert.deepEqual(body.tools, TOOLS);
    assert.equal(body.max_tokens, 1024);
    assert.deepEqual(body.thinking, { type: "disabled" });
    assert.equal("model" in body, false);
    assert.equal(body.messages[0].role, "user");
    for (let i = 1; i < body.messages.length; i++) {
      assert.notEqual(body.messages[i - 1].role, body.messages[i].role);
    }
  }
});

test("tool uses are paired with the following user tool results", () => {
  for (const body of referenceCalls()) {
    const messages = body.messages;
    for (let index = 0; index < messages.length; index++) {
      const message = messages[index];
      if (message.role !== "assistant" || !Array.isArray(message.content)) continue;
      const toolUses = message.content.filter((block) => block.type === "tool_use");
      if (toolUses.length === 0) continue;
      const next = messages[index + 1];
      assert.equal(next?.role, "user");
      const toolResults = next.content.filter((block) => block.type === "tool_result");
      assert.deepEqual(
        toolResults.map(({ tool_use_id }) => tool_use_id),
        toolUses.map(({ id }) => id),
      );
    }
  }
});

test("reference task contains only fictional email domains", () => {
  const addresses = JSON.stringify(referenceCalls()).match(/[\w.+-]+@([\w-]+(?:\.[\w-]+)+)/g) ?? [];
  assert.ok(addresses.length > 0);
  for (const address of addresses) {
    const domain = address.split("@")[1];
    assert.ok(domain === "example.com" || domain === "example.org", `unexpected address domain: ${domain}`);
  }
});

test("referenceCalls returns fresh nested objects", () => {
  const first = referenceCalls();
  first[0].tools[0].input_schema.required[0] = "mutated";
  first[0].messages[0].content = "mutated";
  const second = referenceCalls();
  assert.equal(second[0].tools[0].input_schema.required[0], "from_name");
  assert.equal(second[0].messages[0].content, "Read Priya's latest email about the launch and draft a reply saying Tuesday works.");
});

test("loadKey prefers the environment and trims it", () => {
  assert.equal(
    loadKey({
      env: { MAYA_CLOUD_AI_API_KEY: "  test-key-not-real-123  " },
      envFileText: "MAYA_CLOUD_AI_API_KEY=file-key",
    }),
    "test-key-not-real-123",
  );
});

test("loadKey reads .env when the environment value is empty or whitespace", () => {
  for (const value of ["", "  "]) {
    assert.equal(
      loadKey({
        env: { MAYA_CLOUD_AI_API_KEY: value },
        envFileText: "OTHER=x\nMAYA_CLOUD_AI_API_KEY=  test-key-not-real-123  ",
      }),
      "test-key-not-real-123",
    );
  }
});

test("loadKey returns null when missing and ignores other .env variables", () => {
  assert.equal(loadKey({ env: {}, envFileText: "OTHER=x" }), null);
  assert.equal(loadKey({ env: {}, envFileText: null }), null);
});

test("redact removes every occurrence of a key and leaves text alone without a key", () => {
  const result = redact("bad key test-key-not-real-123 here: test-key-not-real-123", "test-key-not-real-123");
  assert.equal(result.includes("test-key-not-real-123"), false);
  assert.match(result, /\[redacted\]/);
  assert.equal(redact("x", null), "x");
});

test("summarize computes per-task mean, minimum, maximum and token means", () => {
  const runs = [
    [
      { input_tokens: 100, output_tokens: 10 },
      { input_tokens: 200, output_tokens: 20 },
      { input_tokens: 300, output_tokens: 30 },
    ],
    [
      { input_tokens: 200, output_tokens: 20, cache_creation_input_tokens: 10 },
      { input_tokens: 100, output_tokens: 10 },
      { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 5 },
    ],
  ];
  const result = summarize("claude-sonnet-5", runs);
  assert.equal(result.runs, 2);
  assert.equal(result.meanInput, 507.5);
  assert.equal(result.meanOutput, 50);
  closeTo(result.meanCost, 0.001513, 1e-12);
  closeTo(result.minCost, 0.001226, 1e-12);
  closeTo(result.maxCost, 0.0018, 1e-12);
});

test("chooseDefaultModel picks the first model within target, including the exact boundary", () => {
  assert.equal(
    chooseDefaultModel([{ model: MODELS[0], meanCost: 0.04 }, { model: MODELS[1], meanCost: 0.03 }], TARGET_USD_PER_TASK),
    "claude-sonnet-5",
  );
  assert.equal(
    chooseDefaultModel([{ model: MODELS[0], meanCost: 0.06 }, { model: MODELS[1], meanCost: 0.03 }], TARGET_USD_PER_TASK),
    "claude-haiku-4-5-20251001",
  );
  assert.equal(
    chooseDefaultModel([{ model: MODELS[0], meanCost: 0.06 }, { model: MODELS[1], meanCost: 0.07 }], TARGET_USD_PER_TASK),
    null,
  );
  assert.equal(chooseDefaultModel([{ model: MODELS[0], meanCost: 0.05 }], 0.05), "claude-sonnet-5");
});

test("renderReport handles dry-run estimates and live measurements", () => {
  const dry = renderReport({ generatedAt: "2026-09-26T00:00:00.000Z", mode: "dry-run" });
  assert.match(dry, /Not measured: dry run/);
  assert.match(dry, /\| claude-sonnet-5 \| US\$0\.0440 \|/);
  assert.match(dry, /\| claude-haiku-4-5-20251001 \| US\$0\.0220 \|/);
  assert.equal(dry.includes("| Mean input tokens |"), false);

  const live = renderReport({
    generatedAt: "2026-09-26T00:00:00.000Z",
    mode: "live",
    runs: 2,
    summaries: [
      { model: "claude-sonnet-5", runs: 2, meanInput: 101.6, meanOutput: 20.4, meanCost: 0.01, minCost: 0.009, maxCost: 0.011 },
      { model: "claude-haiku-4-5-20251001", runs: 2, meanInput: 90, meanOutput: 15, meanCost: 0.02, minCost: 0.019, maxCost: 0.021 },
    ],
  });
  assert.match(live, /\| Model \| Runs \| Mean input tokens \| Mean output tokens \| Mean cost \| Min cost \| Max cost \| Mean within target \|/);
  assert.match(live, /Mean within target/);
  assert.match(live, /smaller than production prompts/);
  assert.match(live, /\*\*Default model for the spike:\*\* `claude-sonnet-5`/);

  const overTarget = renderReport({
    generatedAt: "2026-09-26T00:00:00.000Z",
    mode: "live",
    runs: 1,
    summaries: [
      { model: "claude-sonnet-5", runs: 1, meanInput: 100, meanOutput: 20, meanCost: 0.06, minCost: 0.06, maxCost: 0.06 },
      { model: "claude-haiku-4-5-20251001", runs: 1, meanInput: 100, meanOutput: 20, meanCost: 0.07, minCost: 0.07, maxCost: 0.07 },
    ],
  });
  assert.match(overTarget, /\*\*Default model for the spike:\*\* none\. No measured model is within the target; the owner decides in SP-08\./);
});

test("checkResponse accepts the requested model and dated snapshots", () => {
  const usage = { input_tokens: 10, output_tokens: 5 };
  assert.equal(checkResponse("claude-sonnet-5", { model: "claude-sonnet-5", usage }), null);
  assert.equal(checkResponse("claude-sonnet-5", { model: "claude-sonnet-5-20260801", usage }), null);
  assert.equal(checkResponse("claude-haiku-4-5-20251001", { model: "claude-haiku-4-5-20251001", usage }), null);
});

test("checkResponse rejects unexpected models before usage validation", () => {
  assert.equal(
    checkResponse("claude-sonnet-5", { model: "claude-sonnet-5-5", usage: {} }),
    "unexpected model claude-sonnet-5-5",
  );
  assert.equal(
    checkResponse("claude-haiku-4-5-20251001", { model: "claude-sonnet-5", usage: {} }),
    "unexpected model claude-sonnet-5",
  );
  assert.equal(checkResponse("claude-sonnet-5", {}), "unexpected model undefined");
});

test("checkResponse requires valid non-negative input and output usage counts", () => {
  assert.equal(checkResponse("claude-sonnet-5", { model: "claude-sonnet-5" }), "missing usage");
  assert.equal(
    checkResponse("claude-sonnet-5", { model: "claude-sonnet-5", usage: { input_tokens: 10, output_tokens: "5" } }),
    "missing usage",
  );
  assert.equal(
    checkResponse("claude-sonnet-5", { model: "claude-sonnet-5", usage: { input_tokens: -1, output_tokens: 5 } }),
    "missing usage",
  );
});
