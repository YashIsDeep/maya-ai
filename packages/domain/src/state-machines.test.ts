import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defineMachine,
  IllegalTransitionError,
  PROPOSAL_MACHINE,
  PROPOSAL_TRANSITIONS,
  proposalAcceptsApproval,
  ProposalStatus,
  TASK_MACHINE,
  TASK_TRANSITIONS,
  TaskState,
  type Transition,
} from "./state-machines.ts";

const EXPECTED_TASK_TRANSITIONS = [
  ["preparing", "succeeded", "read_only_answer_complete"],
  ["preparing", "failed", "preparation_failed"],
  ["preparing", "awaiting_approval", "proposal_validated"],
  ["preparing", "blocked", "needs_input_access_or_home_pc"],
  ["blocked", "preparing", "input_or_access_provided"],
  ["preparing", "cancelled", "user_cancelled"],
  ["blocked", "cancelled", "user_cancelled"],
  ["awaiting_approval", "preparing", "edited_or_context_stale"],
  ["awaiting_approval", "cancelled", "rejected_cancelled_or_revoked"],
  ["awaiting_approval", "expired", "review_deadline_passed"],
  ["awaiting_approval", "approved", "approval_consumed"],
  ["approved", "preparing", "policy_or_precondition_changed"],
  ["approved", "cancelled", "cancelled_or_revoked_before_dispatch_claim"],
  ["approved", "expired", "dispatch_window_elapsed"],
  ["approved", "executing", "dispatch_claimed"],
  ["executing", "succeeded", "provider_confirmed_acceptance"],
  ["executing", "failed", "definite_rejection"],
  ["executing", "outcome_unknown", "response_or_receipt_missing"],
  ["outcome_unknown", "succeeded", "confirmed_by_reconciliation"],
  ["outcome_unknown", "failed", "confirmed_not_performed"],
  ["outcome_unknown", "unresolved", "reconciliation_exhausted"],
  ["unresolved", "succeeded", "verified_acceptance_evidence"],
  ["unresolved", "failed", "verified_non_execution_evidence"],
] as const;

const EXPECTED_PROPOSAL_TRANSITIONS = [
  ["awaiting_approval", "approved", "approval_consumed"],
  ["awaiting_approval", "superseded", "edited_or_context_stale"],
  ["awaiting_approval", "cancelled", "rejected_cancelled_or_revoked"],
  ["awaiting_approval", "expired", "review_deadline_passed"],
  ["approved", "superseded", "policy_or_precondition_changed"],
  ["approved", "cancelled", "cancelled_or_revoked_before_dispatch_claim"],
  ["approved", "expired", "dispatch_window_elapsed"],
  ["approved", "dispatched", "dispatch_claimed"],
] as const;

const CONTRACT_TRANSITIONS = [
  ["blocked", "preparing", "input_or_access_provided"],
  ["awaiting_approval", "preparing", "edited_or_context_stale"],
  ["preparing", "awaiting_approval", "proposal_validated"],
  ["preparing", "blocked", "needs_input_access_or_home_pc"],
  ["awaiting_approval", "approved", "approval_consumed"],
  ["awaiting_approval", "cancelled", "rejected_cancelled_or_revoked"],
  ["awaiting_approval", "expired", "review_deadline_passed"],
  ["preparing", "cancelled", "user_cancelled"],
  ["blocked", "cancelled", "user_cancelled"],
  ["approved", "cancelled", "cancelled_or_revoked_before_dispatch_claim"],
  ["approved", "preparing", "policy_or_precondition_changed"],
  ["outcome_unknown", "succeeded", "confirmed_by_reconciliation"],
  ["outcome_unknown", "failed", "confirmed_not_performed"],
  ["outcome_unknown", "unresolved", "reconciliation_exhausted"],
  ["unresolved", "succeeded", "verified_acceptance_evidence"],
  ["unresolved", "failed", "verified_non_execution_evidence"],
] as const;

function edgeKey(edge: readonly [string, string, string]): string {
  return edge.join("|");
}

test("task transition table matches the §3 state diagram", () => {
  const actual = TASK_MACHINE.transitions.map((edge) => edgeKey([edge.from, edge.to, edge.trigger]));
  const expected = EXPECTED_TASK_TRANSITIONS.map(edgeKey);
  assert.equal(actual.length, 23);
  assert.equal(new Set(actual).size, actual.length);
  assert.deepEqual(new Set(actual), new Set(expected));
});

test("every illegal task state and trigger triple is rejected", () => {
  const expected = new Set(EXPECTED_TASK_TRANSITIONS.map(edgeKey));
  const triggers = [...new Set(EXPECTED_TASK_TRANSITIONS.map((edge) => edge[2]))];
  let allowedCount = 0;

  for (const from of TaskState.options) {
    for (const to of TaskState.options) {
      for (const trigger of triggers) {
        const shouldAllow = expected.has(edgeKey([from, to, trigger]));
        assert.equal(TASK_MACHINE.allows(from, to, trigger), shouldAllow);
        if (shouldAllow) {
          allowedCount += 1;
        } else {
          assert.throws(
            () => TASK_MACHINE.assert(from, to, trigger),
            (error: unknown) => {
              assert.ok(error instanceof IllegalTransitionError);
              assert.equal(error.machine, "task");
              assert.equal(error.from, from);
              assert.equal(error.to, to);
              assert.equal(error.trigger, trigger);
              return true;
            },
          );
        }
      }
    }
  }

  assert.equal(allowedCount, 23);
});

test("a legal task pair with the wrong trigger is rejected", () => {
  assert.throws(() => TASK_MACHINE.assert("approved", "preparing", "edited_or_context_stale"), IllegalTransitionError);
  assert.throws(
    () => TASK_MACHINE.assert("awaiting_approval", "preparing", "policy_or_precondition_changed"),
    IllegalTransitionError,
  );
});

test("a detached assert still rejects illegal transitions", () => {
  const { assert: assertTask } = TASK_MACHINE;
  assert.doesNotThrow(() => assertTask("approved", "executing", "dispatch_claimed"));
  assert.throws(() => assertTask("outcome_unknown", "executing", "dispatch_claimed"), IllegalTransitionError);
});

test("unknown task states and triggers are rejected", () => {
  assert.equal(TASK_MACHINE.allows("sent", "failed", "preparation_failed"), false);
  assert.throws(
    () => TASK_MACHINE.assert("sent", "failed", "preparation_failed"),
    (error: unknown) => {
      assert.ok(error instanceof IllegalTransitionError);
      assert.equal(error.machine, "task");
      assert.equal(error.from, "sent");
      assert.equal(error.to, "failed");
      assert.equal(error.trigger, "preparation_failed");
      return true;
    },
  );
  assert.equal(TASK_MACHINE.allows("preparing", "failed", "unknown_trigger"), false);
});

test("task initial and terminal states are pinned", () => {
  assert.equal(TASK_MACHINE.initial, "preparing");
  assert.deepEqual(new Set(TASK_MACHINE.terminal), new Set(["succeeded", "failed", "cancelled", "expired"]));
  assert.equal(TASK_MACHINE.terminal.includes("unresolved"), false);
  assert.deepEqual(
    TASK_MACHINE.transitions.filter((edge) => edge.from === "unresolved").map((edge) => [edge.to, edge.trigger]),
    [
      ["succeeded", "verified_acceptance_evidence"],
      ["failed", "verified_non_execution_evidence"],
    ],
  );
});

test("task transitions cannot automatically resend or enter protected states", () => {
  for (const edge of TASK_MACHINE.transitions) {
    if (edge.from === "outcome_unknown" || edge.from === "unresolved") {
      assert.equal(["preparing", "approved", "executing"].includes(edge.to), false);
    }
    if (edge.to === "executing") {
      assert.equal(edge.from, "approved");
      assert.equal(edge.trigger, "dispatch_claimed");
    }
    if (edge.to === "approved") {
      assert.equal(edge.trigger, "approval_consumed");
    }
  }
});

test("every task transition named in contract §6 is legal", () => {
  for (const [from, to, trigger] of CONTRACT_TRANSITIONS) {
    assert.equal(TASK_MACHINE.allows(from, to, trigger), true, from + " -> " + to + " via " + trigger);
    assert.notEqual(to, "executing");
  }
});

test("proposal transition table matches the immutable-version lifecycle", () => {
  const actual = PROPOSAL_MACHINE.transitions.map((edge) => edgeKey([edge.from, edge.to, edge.trigger]));
  const expected = EXPECTED_PROPOSAL_TRANSITIONS.map(edgeKey);
  assert.equal(actual.length, 8);
  assert.equal(new Set(actual).size, actual.length);
  assert.deepEqual(new Set(actual), new Set(expected));
});

test("every illegal proposal state and trigger triple is rejected", () => {
  const expected = new Set(EXPECTED_PROPOSAL_TRANSITIONS.map(edgeKey));
  const triggers = [...new Set(EXPECTED_PROPOSAL_TRANSITIONS.map((edge) => edge[2]))];
  let allowedCount = 0;

  for (const from of ProposalStatus.options) {
    for (const to of ProposalStatus.options) {
      for (const trigger of triggers) {
        const shouldAllow = expected.has(edgeKey([from, to, trigger]));
        assert.equal(PROPOSAL_MACHINE.allows(from, to, trigger), shouldAllow);
        if (shouldAllow) {
          allowedCount += 1;
        } else {
          assert.throws(
            () => PROPOSAL_MACHINE.assert(from, to, trigger),
            (error: unknown) => {
              assert.ok(error instanceof IllegalTransitionError);
              assert.equal(error.machine, "proposal");
              assert.equal(error.from, from);
              assert.equal(error.to, to);
              assert.equal(error.trigger, trigger);
              return true;
            },
          );
        }
      }
    }
  }

  assert.equal(allowedCount, 8);
});

test("proposal initial and terminal states are pinned", () => {
  assert.equal(PROPOSAL_MACHINE.initial, "awaiting_approval");
  assert.deepEqual(new Set(PROPOSAL_MACHINE.terminal), new Set(["dispatched", "superseded", "cancelled", "expired"]));
});

test("only an awaiting proposal version accepts an approval", () => {
  for (const status of ProposalStatus.options) {
    assert.equal(proposalAcceptsApproval(status), status === "awaiting_approval");
  }
});

test("task and proposal machines agree on lifecycle trigger mapping", () => {
  for (const proposalEdge of PROPOSAL_TRANSITIONS) {
    const taskEdge = TASK_TRANSITIONS.find(
      (edge) => edge.from === proposalEdge.from && edge.trigger === proposalEdge.trigger,
    );
    assert.ok(taskEdge, "missing task edge for proposal trigger " + proposalEdge.trigger);
    const expectedTaskTarget =
      proposalEdge.to === "superseded" ? "preparing" : proposalEdge.to === "dispatched" ? "executing" : proposalEdge.to;
    assert.equal(taskEdge.to, expectedTaskTarget);
  }
});

test("defineMachine rejects unknown states, duplicate pairs and unknown initial states", () => {
  type TinyState = "one" | "two";
  type TinyTrigger = "advance";
  const edge = { from: "one", to: "two", trigger: "advance" } as const satisfies Transition<TinyState, TinyTrigger>;
  assert.throws(() =>
    Reflect.apply(defineMachine, undefined, [
      "bad-edge",
      ["one", "two"],
      "one",
      [{ from: "one", to: "missing", trigger: "advance" }],
    ]),
  );
  assert.throws(() => defineMachine("duplicate", ["one", "two"] as const, "one", [edge, edge]));
  assert.throws(() => Reflect.apply(defineMachine, undefined, ["bad-initial", ["one", "two"], "missing", [edge]]));
});

test("the exported state schemas list the machine states", () => {
  assert.deepEqual(TASK_MACHINE.states, TaskState.options);
  assert.deepEqual(PROPOSAL_MACHINE.states, ProposalStatus.options);
});
