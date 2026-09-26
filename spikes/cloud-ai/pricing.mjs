// Published Claude API standard prices (global routing), US$ per million tokens.
export const PRICES_AS_OF = "2026-09-26";
export const PRICES_SOURCE = "https://platform.claude.com/docs/en/about-claude/pricing";
export const PRICES = {
  "claude-sonnet-5": { input: 2, output: 10, cacheWrite5m: 2.5, cacheRead: 0.2 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5, cacheWrite5m: 1.25, cacheRead: 0.1 },
};
/** Measured in order of preference (docs/spike/cloud-ai.md §5). */
export const MODELS = ["claude-sonnet-5", "claude-haiku-4-5-20251001"];
/** Owner's target, docs/DECISIONS.md 2026-09-26. */
export const TARGET_USD_PER_TASK = 0.05;
/** The published-price envelope in docs/spike/cloud-ai.md §5. */
export const ENVELOPE = { input_tokens: 12000, output_tokens: 2000 };

/** US$ cost of one API response's `usage`; missing cache fields count as 0. */
export function costOf(model, usage) {
  const p = PRICES[model];
  if (!p) throw new Error(`No price for model ${model}`);
  const n = (k) => usage[k] ?? 0;
  return (n("input_tokens") * p.input + n("output_tokens") * p.output +
    n("cache_creation_input_tokens") * p.cacheWrite5m + n("cache_read_input_tokens") * p.cacheRead) / 1e6;
}
