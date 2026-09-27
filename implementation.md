# Implementation: [M0-02] Create the TypeScript coordinator workspace

## Changes

- Added a private npm workspaces root using Node 24, strict TypeScript 7.0.2, ES modules, Oxlint with tsgolint, and Prettier.
- Added the empty `@maya/coordinator` application package and the `@maya/domain` source package, linked as a workspace dependency.
- Added one built-in `node:test` test per package. The coordinator test imports the domain package by its workspace name.
- Registered install, formatting, test, typecheck, and lint checks. Preserved the existing root and `docs/agentify` checks.
- Added README build and test instructions and recorded the M0-02 owner decisions.

## Checks

- `npm install -D -E typescript@7.0.2 oxlint@1.85.0 oxlint-tsgolint@7.0.2003 prettier@3.9.9 @types/node@24` — passed; the exact `@types/node` version resolved to 24.19.0.
- `npm run format` — passed.
- `node scripts/check.mjs` — passed, 10/10 registered checks. This includes two existing checks (the root Agentify tick tests and the `docs/agentify` smoke sentence) and eight M0-02 checks. The tick suite passed all 45 tests.

## Negative verification

Each temporary fault was reverted immediately after its check. None is committed.

- Added an un-awaited `Promise.resolve()` to `packages/domain/src/index.ts`; `npm run lint --workspace @maya/domain` failed at `src/index.ts:4:1` with `typescript(no-floating-promises): Promises must be awaited`.
- Added `const x: number = "a";` to `packages/domain/src/index.ts`; `npm run typecheck --workspace @maya/domain` failed at `src/index.ts(4,7)` with `TS2322: Type 'string' is not assignable to type 'number'.`
- Removed required spaces from the domain export; `npm run format:check` failed and reported `[warn] packages/domain/src/index.ts` and `Code style issues found in the above file.`
- Changed the coordinator assertion to expect `"wrong"`; `npm test --workspace @maya/coordinator` failed at `src\workspace.test.ts:5:1` with `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:`.
- Restored all four files and confirmed `npm run format:check` passes.

## Assumptions

- `@types/node` 24.19.0 is the newest published 24.x version available to the pinned install, saved exactly.
- The root Node engine range is `^24.0.0`, and Prettier uses its defaults with `printWidth` 120, as specified in the approved plan.
- The existing registered checks remain in place; the actual complete check count is 10/10.

## Owner steps

None.

## Follow-up

None.

---

# Implementation: [SP-04] Spike: choose the cloud AI processor

## Changes

- Added the approved provider comparison in `docs/spike/cloud-ai.md` and appended the three owner decisions to `docs/DECISIONS.md`.
- Added the Claude pricing, fictional plan/draft/revise fixture, pure measurement helpers, live/dry-run CLI, 16 offline tests, and the registered check in `spikes/cloud-ai/`.
- Generated and committed `docs/spike/cloud-ai-measurements.md` in dry-run mode.
- Left both blueprints unchanged.

## Checks

- `node spikes/cloud-ai/measure.mjs --dry-run` — passed; generated the dry-run report without reading a key or making API calls.
- `node --test spikes/cloud-ai/test/cloud-ai.test.mjs` — passed, 16/16.
- `node scripts/check.mjs` — passed, 11/11 registered checks.
- Confirmed `.env` is not tracked, the committed diff contains no forbidden key-prefix string, and the blueprints have no diff from `main`.

## Assumptions

- Provider terms and prices are those in the approved report, sourced as of 26 September 2026; they must be rechecked before beta and public release.
- The API key, when used, is the owner's Claude Console key under Anthropic's Commercial Terms.
- Answer quality remains for FD-15 and the private beta.

## Owner steps

- Asked through Agentify whether `MAYA_CLOUD_AI_API_KEY` is set in the task worktree's `.env`. No answer arrived during the first extended wait, so I repeated the same question once as required by §3.2; the repeated request also remained unanswered beyond the expected timeout window.
- Did not inspect `.env`, request approval for the live run, or make any provider calls. The measurements file therefore remains the generated dry-run report.

## Follow-up

- After the owner answers the key-status question, request separate approval for the exact live command in the approved plan. If approved, run it unchanged; if it fails, retain the dry-run report and record the redacted error as specified.

---

# Implementation: [M0-04] Define domain object schemas, state machines and the API contract

## Changes

- Added Zod 4.6.5 to `@maya/domain` and exported strict schemas for the 15 domain objects, shared scalars, opaque IDs, and 1.0-only access and operation values.
- Added task and proposal state machines with their 23 and 8 allowed edges, transition assertion helpers, and immutable proposal approval gating.
- Added fixtures and tests for required fields, strict unknown-key rejection, JSON Schema export, deferred-capability rejection, timestamp and reference formats, and all illegal state/trigger combinations.
- Added `docs/design/api-contract.md` with the 32 logical endpoints, actor allowlists, request and response shapes, endpoint-caused transitions, the no-send-bypass rule, deferred capabilities, and the CL-01 Dart generation plan.
- Re-exported the domain schemas and machines from the package entry point.

## Checks

- `npm run format` — passed.
- `node scripts/check.mjs` — passed, 11/11 registered checks, including the domain tests, typecheck and lint.
- Domain test suite — passed, 27/27 tests.

## Assumptions and implementation notes

- Used the approved plan's Zod 4.6.5 pin and schema decisions. No new product assumptions were made.
- The branded-ID helper accepts a brand literal parameter so TypeScript can infer the brand while satisfying the repository's type-aware lint rules.
- No `docs/DECISIONS.md` entry was needed.

## Owner steps

None.

## Follow-up

- M0-04a adds request, response and view schemas plus the endpoint registry and actor allowlists.
- CL-01 emits JSON Schema and generates the Dart client types described in the API contract.

## Review corrections

- Restored `docs/design/api-contract.md` to the approved plan text. The first commit had rewritten its code spans: request and response shapes lost their backticks, and ordinary words such as "failed" and "approved" gained them.
- `StateMachine.assert` no longer depends on `this`, so a detached `assert` still throws `IllegalTransitionError` (new test). Its methods are typed `this: void`.
- The illegal-transition tests now check against their own literal edge tables and the state enums, not the machine under test.
- `Task.phase`, `Execution.receipt`, `Execution.claim.workerId` and `ActivityEvent.proposal.version` now use the plan's named primitives (`CodeName`, `ProviderId`, `ID_PATTERN`, `Version`). Behaviour is unchanged.
- `node scripts/check.mjs` passed, 11/11; the domain suite has 28 tests.
