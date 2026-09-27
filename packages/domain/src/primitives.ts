import * as z from "zod";

export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function id<B extends string>(brand: B) {
  void brand;
  return z.string().regex(ID_PATTERN).brand<B>();
}

export const OwnerId = id("OwnerId");
export type OwnerId = z.infer<typeof OwnerId>;

export const ConversationId = id("ConversationId");
export type ConversationId = z.infer<typeof ConversationId>;

export const TurnId = id("TurnId");
export type TurnId = z.infer<typeof TurnId>;

export const DeviceId = id("DeviceId");
export type DeviceId = z.infer<typeof DeviceId>;

export const SessionId = id("SessionId");
export type SessionId = z.infer<typeof SessionId>;

export const ConnectionId = id("ConnectionId");
export type ConnectionId = z.infer<typeof ConnectionId>;

export const GrantId = id("GrantId");
export type GrantId = z.infer<typeof GrantId>;

export const SourceId = id("SourceId");
export type SourceId = z.infer<typeof SourceId>;

export const MemoryId = id("MemoryId");
export type MemoryId = z.infer<typeof MemoryId>;

export const TaskId = id("TaskId");
export type TaskId = z.infer<typeof TaskId>;

export const DraftId = id("DraftId");
export type DraftId = z.infer<typeof DraftId>;

export const ProposalId = id("ProposalId");
export type ProposalId = z.infer<typeof ProposalId>;

export const ApprovalId = id("ApprovalId");
export type ApprovalId = z.infer<typeof ApprovalId>;

export const ChallengeId = id("ChallengeId");
export type ChallengeId = z.infer<typeof ChallengeId>;

export const ExecutionId = id("ExecutionId");
export type ExecutionId = z.infer<typeof ExecutionId>;

export const LeaseId = id("LeaseId");
export type LeaseId = z.infer<typeof LeaseId>;

export const ActivityEventId = id("ActivityEventId");
export type ActivityEventId = z.infer<typeof ActivityEventId>;

export const CoordinatorId = id("CoordinatorId");
export type CoordinatorId = z.infer<typeof CoordinatorId>;

export const Timestamp = z.iso.datetime({ precision: 3 });
export type Timestamp = z.infer<typeof Timestamp>;

export const Version = z.int().min(1);
export type Version = z.infer<typeof Version>;

export const CoordinatorEpoch = z.int().min(1);
export type CoordinatorEpoch = z.infer<typeof CoordinatorEpoch>;

export const Sha256Digest = z.string().regex(/^sha256:[0-9a-f]{64}$/);
export type Sha256Digest = z.infer<typeof Sha256Digest>;

export const Text = z.string().max(100_000);
export type Text = z.infer<typeof Text>;

export const CodeName = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
export type CodeName = z.infer<typeof CodeName>;

export const EmailAddress = z.email();
export type EmailAddress = z.infer<typeof EmailAddress>;

export const ProviderRef = z.string().regex(/^[A-Za-z0-9_.:@<>/+=-]{1,512}$/);
export type ProviderRef = z.infer<typeof ProviderRef>;

export const ProviderId = z.string().regex(/^[A-Za-z0-9_-]{1,255}$/);
export type ProviderId = z.infer<typeof ProviderId>;

export const CommandKey = z.string().regex(/^[A-Za-z0-9_:.-]{1,160}$/);
export type CommandKey = z.infer<typeof CommandKey>;

export const CorrelationId = z.string().regex(/^<[A-Za-z0-9_.+=-]{1,128}@[A-Za-z0-9.-]{1,253}>$/);
export type CorrelationId = z.infer<typeof CorrelationId>;

export const EventCursor = z.strictObject({
  epoch: CoordinatorEpoch,
  sequence: z.int().min(0),
});
export type EventCursor = z.infer<typeof EventCursor>;

export const GrantVersionRef = z.strictObject({
  grantId: GrantId,
  version: Version,
});
export type GrantVersionRef = z.infer<typeof GrantVersionRef>;

export const ObjectType = z.enum([
  "owner_policy",
  "conversation",
  "device",
  "connection",
  "grant",
  "source",
  "memory",
  "task",
  "draft",
  "proposal",
  "approval",
  "execution",
  "device_cache_lease",
  "activity_event",
]);
export type ObjectType = z.infer<typeof ObjectType>;

export const ObjectRef = z.strictObject({
  type: ObjectType,
  id: z.string().regex(ID_PATTERN),
  version: Version.nullable(),
});
export type ObjectRef = z.infer<typeof ObjectRef>;

export const DataCategory = z.enum([
  "task_text",
  "email_text_and_addresses",
  "calendar_availability",
  "explicit_memory",
  "event_details",
]);
export type DataCategory = z.infer<typeof DataCategory>;

export const ProcessingDestination = z.enum(["home_pc", "paired_devices", "cloud_ai"]);
export type ProcessingDestination = z.infer<typeof ProcessingDestination>;

export const StorageMode = z.enum(["memory_only", "encrypted"]);
export type StorageMode = z.infer<typeof StorageMode>;

export const Actor = z.enum([
  "owner_session",
  "pairing_candidate",
  "planner",
  "read_broker",
  "executor",
  "coordinator",
]);
export type Actor = z.infer<typeof Actor>;

export const READ_OPERATIONS = [
  "mail.message.read",
  "mail.reply_status.read",
  "calendar.freebusy.read",
  "calendar.event.read",
] as const;

export const WRITE_OPERATIONS = ["mail.reply.send"] as const;

export const ReadOperationName = z.enum(READ_OPERATIONS);
export type ReadOperationName = z.infer<typeof ReadOperationName>;

export const WriteOperationName = z.enum(WRITE_OPERATIONS);
export type WriteOperationName = z.infer<typeof WriteOperationName>;

export const OperationName = z.enum([...READ_OPERATIONS, ...WRITE_OPERATIONS]);
export type OperationName = z.infer<typeof OperationName>;

export const Purpose = z.enum(["on_demand_task", "reply_status_check", "task_processing"]);
export type Purpose = z.infer<typeof Purpose>;
