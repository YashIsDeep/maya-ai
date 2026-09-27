import { OwnerPolicy, Connection, Grant, SourceRecord } from "./access.ts";
import { Proposal, Approval, Execution } from "./approvals.ts";
import { Device, DeviceCacheLease } from "./devices.ts";
import { ActivityEvent, SyncEvent } from "./records.ts";
import { Conversation, Draft, Memory, Task } from "./work.ts";

export const DOMAIN_OBJECTS = {
  ownerPolicy: OwnerPolicy,
  conversation: Conversation,
  device: Device,
  connection: Connection,
  grant: Grant,
  sourceRecord: SourceRecord,
  memory: Memory,
  task: Task,
  draft: Draft,
  proposal: Proposal,
  approval: Approval,
  execution: Execution,
  deviceCacheLease: DeviceCacheLease,
  syncEvent: SyncEvent,
  activityEvent: ActivityEvent,
} as const;
