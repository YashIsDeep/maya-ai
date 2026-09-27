import * as z from "zod";

export const TaskState = z.enum([
  "preparing",
  "blocked",
  "awaiting_approval",
  "approved",
  "executing",
  "outcome_unknown",
  "unresolved",
  "succeeded",
  "failed",
  "cancelled",
  "expired",
]);
export type TaskState = z.infer<typeof TaskState>;

export const ProposalStatus = z.enum([
  "awaiting_approval",
  "approved",
  "dispatched",
  "superseded",
  "cancelled",
  "expired",
]);
export type ProposalStatus = z.infer<typeof ProposalStatus>;

export interface Transition<S extends string, T extends string> {
  readonly from: S;
  readonly to: S;
  readonly trigger: T;
}

export const TASK_TRANSITIONS = [
  { from: "preparing", to: "succeeded", trigger: "read_only_answer_complete" },
  { from: "preparing", to: "failed", trigger: "preparation_failed" },
  { from: "preparing", to: "awaiting_approval", trigger: "proposal_validated" },
  { from: "preparing", to: "blocked", trigger: "needs_input_access_or_home_pc" },
  { from: "blocked", to: "preparing", trigger: "input_or_access_provided" },
  { from: "preparing", to: "cancelled", trigger: "user_cancelled" },
  { from: "blocked", to: "cancelled", trigger: "user_cancelled" },
  { from: "awaiting_approval", to: "preparing", trigger: "edited_or_context_stale" },
  { from: "awaiting_approval", to: "cancelled", trigger: "rejected_cancelled_or_revoked" },
  { from: "awaiting_approval", to: "expired", trigger: "review_deadline_passed" },
  { from: "awaiting_approval", to: "approved", trigger: "approval_consumed" },
  { from: "approved", to: "preparing", trigger: "policy_or_precondition_changed" },
  { from: "approved", to: "cancelled", trigger: "cancelled_or_revoked_before_dispatch_claim" },
  { from: "approved", to: "expired", trigger: "dispatch_window_elapsed" },
  { from: "approved", to: "executing", trigger: "dispatch_claimed" },
  { from: "executing", to: "succeeded", trigger: "provider_confirmed_acceptance" },
  { from: "executing", to: "failed", trigger: "definite_rejection" },
  { from: "executing", to: "outcome_unknown", trigger: "response_or_receipt_missing" },
  { from: "outcome_unknown", to: "succeeded", trigger: "confirmed_by_reconciliation" },
  { from: "outcome_unknown", to: "failed", trigger: "confirmed_not_performed" },
  { from: "outcome_unknown", to: "unresolved", trigger: "reconciliation_exhausted" },
  { from: "unresolved", to: "succeeded", trigger: "verified_acceptance_evidence" },
  { from: "unresolved", to: "failed", trigger: "verified_non_execution_evidence" },
] as const satisfies readonly Transition<TaskState, string>[];

export type TaskTrigger = (typeof TASK_TRANSITIONS)[number]["trigger"];

export const PROPOSAL_TRANSITIONS = [
  { from: "awaiting_approval", to: "approved", trigger: "approval_consumed" },
  { from: "awaiting_approval", to: "superseded", trigger: "edited_or_context_stale" },
  { from: "awaiting_approval", to: "cancelled", trigger: "rejected_cancelled_or_revoked" },
  { from: "awaiting_approval", to: "expired", trigger: "review_deadline_passed" },
  { from: "approved", to: "superseded", trigger: "policy_or_precondition_changed" },
  { from: "approved", to: "cancelled", trigger: "cancelled_or_revoked_before_dispatch_claim" },
  { from: "approved", to: "expired", trigger: "dispatch_window_elapsed" },
  { from: "approved", to: "dispatched", trigger: "dispatch_claimed" },
] as const satisfies readonly Transition<ProposalStatus, string>[];

export type ProposalTrigger = (typeof PROPOSAL_TRANSITIONS)[number]["trigger"];

export class IllegalTransitionError extends Error {
  readonly machine: string;
  readonly from: string;
  readonly to: string;
  readonly trigger: string;

  constructor(machine: string, from: string, to: string, trigger: string) {
    super("Illegal " + machine + " transition: " + from + " -> " + to + " via " + trigger);
    this.name = "IllegalTransitionError";
    this.machine = machine;
    this.from = from;
    this.to = to;
    this.trigger = trigger;
  }
}

export interface StateMachine<S extends string, T extends string> {
  readonly name: string;
  readonly states: readonly S[];
  readonly initial: S;
  readonly terminal: readonly S[];
  readonly transitions: readonly Transition<S, T>[];
  allows(this: void, from: string, to: string, trigger: string): boolean;
  assert(this: void, from: string, to: string, trigger: string): void;
}

export function defineMachine<S extends string, T extends string>(
  name: string,
  states: readonly S[],
  initial: S,
  transitions: readonly Transition<S, T>[],
): StateMachine<S, T> {
  const knownStates = new Set<string>(states);
  if (!knownStates.has(initial)) {
    throw new Error("Unknown initial state for " + name + ": " + initial);
  }

  const pairs = new Set<string>();
  for (const transition of transitions) {
    if (!knownStates.has(transition.from) || !knownStates.has(transition.to)) {
      throw new Error("Unknown state in " + name + " transition");
    }
    const pair = transition.from + "\u0000" + transition.to;
    if (pairs.has(pair)) {
      throw new Error("Duplicate from/to pair in " + name + " transition table");
    }
    pairs.add(pair);
  }

  const terminal = states.filter((state) => !transitions.some((transition) => transition.from === state));
  const allows = (from: string, to: string, trigger: string): boolean =>
    transitions.some(
      (transition) => transition.from === from && transition.to === to && transition.trigger === trigger,
    );
  return {
    name,
    states,
    initial,
    terminal,
    transitions,
    allows,
    assert(from, to, trigger) {
      if (!allows(from, to, trigger)) {
        throw new IllegalTransitionError(name, from, to, trigger);
      }
    },
  };
}

export const TASK_MACHINE = defineMachine("task", TaskState.options, "preparing", TASK_TRANSITIONS);
export const PROPOSAL_MACHINE = defineMachine(
  "proposal",
  ProposalStatus.options,
  "awaiting_approval",
  PROPOSAL_TRANSITIONS,
);

export function proposalAcceptsApproval(status: ProposalStatus): boolean {
  return status === "awaiting_approval";
}
