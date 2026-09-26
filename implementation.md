# Implementation: [PX-01] Tick skill

## Changes

- Added `scripts/agentify/claims.mjs` for exclusive lease creation, generation locks, stale takeover,
  token-checked heartbeats and release, and dead-generation cleanup.
- Added `scripts/agentify/tick.mjs` with the `claim`, `watch`, `release`, `status`, and `candidates`
  commands. Backlog claims and starts are serialized under the shared start lock. Watch uses SSE and
  polling, and retries only interrupted runs or inactivity timeouts.
- Added a fake Agentify HTTP server and race, ranking, readiness, tag, watch, and end-to-end tests.
  Registered them in the root `maya.checks.json`.
- Added the `/agentify-tick` project skill and updated `docs/AGENTIFY_PROCESS.md` and
  `docs/DECISIONS.md` with the approved text.

## Agentify adapter

The adapter currently follows the D4 expected mappings in the approved plan. The plan's Owner step 1
read-only check is still pending through `ask_user`; no source under `C:\code\workflow-manager` or
live Agentify endpoint has been accessed. Confirm the mappings and record any differences here before
the implementation is considered complete.

## Checks

- `node scripts/check.mjs` — passed: 45 tick tests and the existing Agentify smoke check (2/2 checks).
- The concurrency race selection passed five consecutive runs. Each run covered fresh lease races,
  stale takeover races, forced interleaving, concurrent CLI claims, and the Backlog start-slot race.

## Owner steps

- Requested approval for the plan's read-only source/API check through `ask_user`; no approval or
  refusal has been returned yet, so the check has not been performed.
- No live `/agentify-tick` run was performed. The skill can be exercised from `C:\code\maya` after
  Merge places it on `main`, as the approved plan specifies.

## Assumptions and follow-up

- No implementation assumptions beyond the approved plan. Complete the D4 source/API verification
  and update this report with the confirmed field mappings before handoff.
