import * as z from "zod";
import {
  ApprovalId,
  ChallengeId,
  CommandKey,
  CoordinatorEpoch,
  CoordinatorId,
  CorrelationId,
  DeviceId,
  ExecutionId,
  GrantVersionRef,
  OwnerId,
  ProposalId,
  Sha256Digest,
  SessionId,
  SourceId,
  TaskId,
  Timestamp,
  Version,
  WriteOperationName,
} from "./primitives.ts";
import { ProposalStatus } from "./state-machines.ts";

export const Proposal = z.strictObject({
  id: ProposalId,
  ownerId: OwnerId,
  taskId: TaskId,
  version: Version,
  status: ProposalStatus,
  operation: z.strictObject({
    name: WriteOperationName,
    schemaVersion: Version,
    connectorVersion: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/),
  }),
  replyTarget: z.strictObject({
    inReplyTo: SourceId,
    audience: z.enum(["reply", "reply_all"]),
  }),
  payloadRef: z.string().regex(/^payload:[A-Za-z0-9_-]{1,128}$/),
  payloadHash: Sha256Digest,
  resourceFingerprint: Sha256Digest,
  grantVersions: z.array(GrantVersionRef).min(1),
  possibleDuplicateOf: ExecutionId.nullable(),
  createdAt: Timestamp,
  contentDeadline: Timestamp,
  reviewDeadline: Timestamp,
});
export type Proposal = z.infer<typeof Proposal>;

export const Approval = z.strictObject({
  id: ApprovalId,
  ownerId: OwnerId,
  proposalId: ProposalId,
  proposalVersion: Version,
  payloadHash: Sha256Digest,
  approver: z.strictObject({
    ownerId: OwnerId,
    deviceId: DeviceId,
    sessionId: SessionId,
  }),
  decision: z.enum(["approve", "reject"]),
  challenge: z.strictObject({
    id: ChallengeId,
    nonce: z.string().regex(/^[A-Za-z0-9_-]{22,128}$/),
  }),
  coordinator: z.strictObject({
    id: CoordinatorId,
    epoch: CoordinatorEpoch,
  }),
  validFrom: Timestamp,
  validUntil: Timestamp,
  consumption: z.enum(["unconsumed", "consumed", "retired"]),
  decidedAt: Timestamp,
});
export type Approval = z.infer<typeof Approval>;

export const Execution = z.strictObject({
  id: ExecutionId,
  ownerId: OwnerId,
  proposalId: ProposalId,
  proposalVersion: Version,
  approvalId: ApprovalId,
  commandKey: CommandKey,
  consentVersion: Version,
  dispatchDeadline: Timestamp,
  claim: z
    .strictObject({
      workerId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
      claimedAt: Timestamp,
    })
    .nullable(),
  dispatchStartedAt: Timestamp.nullable(),
  attempts: z.int().min(0),
  correlationId: CorrelationId,
  receipt: z
    .strictObject({
      providerMessageId: z.string().regex(/^[A-Za-z0-9_-]{1,255}$/),
      providerThreadId: z.string().regex(/^[A-Za-z0-9_-]{1,255}$/),
      acceptedAt: Timestamp,
    })
    .nullable(),
  evidence: z.array(
    z.strictObject({
      kind: z.enum(["provider_acceptance", "reconciliation_match", "verified_not_performed", "check_exhausted"]),
      observedAt: Timestamp,
      digest: Sha256Digest.nullable(),
    }),
  ),
  outcome: z.enum(["pending", "succeeded", "failed", "outcome_unknown", "unresolved", "retired"]),
  payloadDeadline: Timestamp,
  evidenceDeadline: Timestamp,
});
export type Execution = z.infer<typeof Execution>;
