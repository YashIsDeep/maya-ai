import * as z from "zod";
import {
  ConversationId,
  DeviceId,
  DraftId,
  EventCursor,
  MemoryId,
  OwnerId,
  ProcessingDestination,
  SourceId,
  StorageMode,
  TaskId,
  Text,
  Timestamp,
  TurnId,
  Version,
} from "./primitives.ts";
import { TaskState } from "./state-machines.ts";

export const ConversationTurn = z.strictObject({
  id: TurnId,
  author: z.enum(["owner", "maya"]),
  taskId: TaskId.nullable(),
  text: Text,
  sourceIds: z.array(SourceId),
  createdAt: Timestamp,
});
export type ConversationTurn = z.infer<typeof ConversationTurn>;

export const Conversation = z.strictObject({
  id: ConversationId,
  ownerId: OwnerId,
  historyMode: z.enum(["off", "on"]),
  retentionDeadline: Timestamp,
  turns: z.array(ConversationTurn),
  createdAt: Timestamp,
});
export type Conversation = z.infer<typeof Conversation>;

const MemoryAuthorization = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("direct_instruction"),
    turnId: TurnId,
    deviceId: DeviceId,
  }),
  z.strictObject({
    kind: z.literal("confirmed_interpretation"),
    turnId: TurnId,
    deviceId: DeviceId,
  }),
  z.strictObject({
    kind: z.literal("owner_entry"),
    deviceId: DeviceId,
  }),
  z.strictObject({
    kind: z.literal("owner_edit"),
    deviceId: DeviceId,
  }),
]);

export const Memory = z.strictObject({
  id: MemoryId,
  ownerId: OwnerId,
  version: Version,
  text: z.string().min(1).max(2000),
  authorization: MemoryAuthorization,
  sourceIds: z.array(SourceId),
  permittedDestinations: z.array(ProcessingDestination),
  retentionDeadline: Timestamp.nullable(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type Memory = z.infer<typeof Memory>;

export const Task = z.strictObject({
  id: TaskId,
  ownerId: OwnerId,
  conversationId: ConversationId,
  status: TaskState,
  phase: z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,63}$/)
    .nullable(),
  inputTurnIds: z.array(TurnId),
  sourceIds: z.array(SourceId),
  effectivePolicy: z.strictObject({
    ownerPolicyVersion: Version,
    storageMode: StorageMode,
    keepOnMyDevices: z.boolean(),
    processingDestinations: z.array(ProcessingDestination),
  }),
  cancellation: z
    .strictObject({
      requestedAt: Timestamp,
      requestedByDeviceId: DeviceId,
      acknowledgedAt: Timestamp.nullable(),
      result: z.enum(["cancelled", "past_dispatch"]).nullable(),
    })
    .nullable(),
  continuesTaskId: TaskId.nullable(),
  eventCursor: EventCursor,
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type Task = z.infer<typeof Task>;

export const Draft = z.strictObject({
  id: DraftId,
  ownerId: OwnerId,
  taskId: TaskId,
  version: Version,
  parentVersion: Version.nullable(),
  text: Text,
  sourceIds: z.array(SourceId),
  conflictingVersions: z.array(Version),
  storageMode: StorageMode,
  createdAt: Timestamp,
  expiresAt: Timestamp,
});
export type Draft = z.infer<typeof Draft>;
