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
