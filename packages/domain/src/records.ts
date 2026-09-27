import * as z from "zod";
import {
  ActivityEventId,
  Actor,
  ApprovalId,
  CodeName,
  ConnectionId,
  CoordinatorEpoch,
  DeviceId,
  GrantVersionRef,
  OwnerId,
  ProcessingDestination,
  ProposalId,
  ProviderRef,
  Purpose,
  TaskId,
  Timestamp,
  ObjectRef,
} from "./primitives.ts";

export const SyncEvent = z.strictObject({
  ownerId: OwnerId,
  coordinatorEpoch: CoordinatorEpoch,
  sequence: z.int().min(1),
  kind: z.enum(["object_changed", "policy_changed", "deleted"]),
  object: ObjectRef,
  occurredAt: Timestamp,
  retentionDeadline: Timestamp,
});
export type SyncEvent = z.infer<typeof SyncEvent>;

export const ActivityEvent = z.strictObject({
  id: ActivityEventId,
  ownerId: OwnerId,
  actor: Actor,
  deviceId: DeviceId.nullable(),
  taskId: TaskId.nullable(),
  connectionId: ConnectionId.nullable(),
  resourceRef: ProviderRef.nullable(),
  operation: z.string().regex(/^[a-z][a-z_]*(\.[a-z][a-z_]*)+$/),
  purpose: Purpose.nullable(),
  processingDestination: ProcessingDestination.nullable(),
  grantVersions: z.array(GrantVersionRef),
  approvalId: ApprovalId.nullable(),
  proposal: z
    .strictObject({
      id: ProposalId,
      version: z.int().min(1),
    })
    .nullable(),
  result: z.enum(["allowed", "denied", "succeeded", "failed", "outcome_unknown", "unresolved"]),
  reasonCode: CodeName.nullable(),
  occurredAt: Timestamp,
  evidenceDeadline: Timestamp,
});
export type ActivityEvent = z.infer<typeof ActivityEvent>;
