import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { checkResponse, chooseDefaultModel, loadKey, redact, renderReport, summarize } from "./lib.mjs";
import { MODELS, TARGET_USD_PER_TASK } from "./pricing.mjs";
import { referenceCalls } from "./reference-task.mjs";

const OUTPUT_URL = new URL("../../docs/spike/cloud-ai-measurements.md", import.meta.url);
const ENV_URL = new URL("../../.env", import.meta.url);
const USAGE = "Usage: node spikes/cloud-ai/measure.mjs --dry-run | --live [--runs N] (N: 1–10; default 5).";

function parseArgs(args) {
  if (args.length === 1 && args[0] === "--dry-run") return { mode: "dry-run" };
  if (args[0] !== "--live") return null;
  if (args.length === 1) return { mode: "live", runs: 5 };
  if (
    args.length === 3 &&
    args[1] === "--runs" &&
    /^\d+$/.test(args[2]) &&
    Number.isInteger(Number(args[2])) &&
    Number(args[2]) >= 1 &&
    Number(args[2]) <= 10
  ) {
    return { mode: "live", runs: Number(args[2]) };
  }
  return null;
}

function reportPath() {
  return "docs/spike/cloud-ai-measurements.md";
}

function writeError(line) {
  process.stderr.write(line + "\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options) {
    writeError(USAGE);
    process.exitCode = 2;
    return;
  }

  if (options.mode === "dry-run") {
    await writeFile(
      OUTPUT_URL,
      renderReport({ generatedAt: new Date().toISOString(), mode: "dry-run" }),
      "utf8",
    );
    process.stdout.write(reportPath() + "\n");
    return;
  }

  const envFileText = existsSync(ENV_URL) ? await readFile(ENV_URL, "utf8") : null;
  const key = loadKey({ env: process.env, envFileText });
  if (key === null) {
    writeError("MAYA_CLOUD_AI_API_KEY is not set in the environment or in .env; see docs/spike/cloud-ai.md §7.");
    process.exitCode = 1;
    return;
  }

  const totalCalls = MODELS.length * 3 * options.runs;
  process.stdout.write(
    `Making ${totalCalls} calls to api.anthropic.com (${MODELS.join(", ")}), ${options.runs} runs each; made-up data only.\n`,
  );

  const allRuns = new Map(MODELS.map((model) => [model, []]));
  for (const model of MODELS) {
    for (let run = 1; run <= options.runs; run++) {
      const taskUsage = [];
      const bodies = referenceCalls();
      for (let call = 1; call <= bodies.length; call++) {
        let response;
        try {
          response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": key,
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
            },
            body: JSON.stringify({ model, ...bodies[call - 1] }),
            signal: AbortSignal.timeout(60000),
          });

          const json = await response.json();
          if (!response.ok) {
            const errType = json?.error?.type ?? json?.type ?? "HTTPError";
            const errMessage = json?.error?.message ?? json?.message ?? response.statusText;
            writeError(redact(`${model} run ${run} call ${call}: HTTP ${response.status} ${errType}: ${errMessage}`, key));
            process.exitCode = 1;
            return;
          }

          const problem = checkResponse(model, json);
          if (problem !== null) {
            writeError(redact(`${model} run ${run} call ${call}: ${problem}`, key));
            process.exitCode = 1;
            return;
          }

          const usage = json.usage;
          taskUsage.push(usage);
          process.stdout.write(
            `${model} run ${run} call ${call}: input ${usage.input_tokens}, output ${usage.output_tokens}\n`,
          );
        } catch (error) {
          const errType = error?.name ?? "Error";
          const errMessage = error?.message ?? String(error);
          writeError(
            redact(
              `${model} run ${run} call ${call}: HTTP ${response?.status ?? "no response"} ${errType}: ${errMessage}`,
              key,
            ),
          );
          process.exitCode = 1;
          return;
        }
      }
      allRuns.get(model).push(taskUsage);
    }
  }

  const summaries = MODELS.map((model) => summarize(model, allRuns.get(model)));
  await writeFile(
    OUTPUT_URL,
    renderReport({
      generatedAt: new Date().toISOString(),
      mode: "live",
      runs: options.runs,
      summaries,
    }),
    "utf8",
  );
  process.stdout.write(reportPath() + "\n");
  const defaultModel = chooseDefaultModel(summaries, TARGET_USD_PER_TASK);
  process.stdout.write(
    defaultModel
      ? `Default model for the spike: ${String.fromCharCode(96)}${defaultModel}${String.fromCharCode(96)}.\n`
      : "Default model for the spike: none. The owner decides in SP-08.\n",
  );
}

await main();
