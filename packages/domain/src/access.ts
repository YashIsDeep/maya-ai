import * as z from "zod";
import {
  ConnectionId,
  DataCategory,
  EmailAddress,
  GrantId,
  GrantVersionRef,
  OwnerId,
  ProcessingDestination,
  ProviderId,
  ProviderRef,
  SourceId,
  Timestamp,
  Version,
} from "./primitives.ts";

export const OwnerPolicy = z.strictObject({
  ownerId: OwnerId,
  version: Version,
  historyEnabled: z.boolean().default(false),
  executionStorageConsent: z
    .strictObject({
      state: z.enum(["granted", "declined"]),
      consentVersion: Version,
      decidedAt: Timestamp,
    })
    .nullable(),
  aiRoute: z.enum(["cloud_ai", "on_this_pc"]).nullable(),
  processingGrantIds: z.array(GrantId),
  disclosedTermsVersion: z.string().min(1).max(64).nullable(),
  updatedAt: Timestamp,
});
export type OwnerPolicy = z.infer<typeof OwnerPolicy>;

export const GoogleScope = z.enum([
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.events.readonly",
]);
export type GoogleScope = z.infer<typeof GoogleScope>;

export const Connection = z.strictObject({
  id: ConnectionId,
  ownerId: OwnerId,
  version: Version,
  provider: z.literal("google"),
  account: z.strictObject({
    subject: z.string().min(1).max(255),
    email: EmailAddress,
  }),
  tokenRef: z
    .string()
    .regex(/^vault:[A-Za-z0-9_-]{1,128}$/)
    .nullable(),
  scopes: z.array(GoogleScope),
  state: z.enum(["authorizing", "connected", "paused", "reauthorization_required", "disconnecting", "disconnected"]),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type Connection = z.infer<typeof Connection>;

const grantBase = {
  id: GrantId,
  ownerId: OwnerId,
  version: Version,
  subject: z.literal("owner"),
  state: z.enum(["active", "paused", "revoked", "expired"]),
  expiresAt: Timestamp.nullable(),
  createdAt: Timestamp,
};

export const Grant = z.discriminatedUnion("kind", [
  z.strictObject({
    ...grantBase,
    kind: z.literal("gmail_access"),
    connectionId: ConnectionId,
    selector: z.strictObject({
      rollingWindowDays: z.int().min(1).max(3650).nullable(),
      labelIds: z.array(ProviderId).nullable(),
    }),
    operations: z.array(z.enum(["mail.message.read", "mail.reply_status.read", "mail.reply.send"])).min(1),
    fieldMask: z.array(z.enum(["headers", "body"])).min(1),
    purpose: z.enum(["on_demand_task", "reply_status_check"]),
    processingDestinations: z.array(ProcessingDestination).min(1),
  }),
  z.strictObject({
    ...grantBase,
    kind: z.literal("calendar_access"),
    connectionId: ConnectionId,
    selector: z.strictObject({ calendar: z.literal("primary") }),
    operations: z.array(z.enum(["calendar.freebusy.read", "calendar.event.read"])).min(1),
    fieldMask: z.array(z.enum(["free_busy", "event_details"])).min(1),
    purpose: z.literal("on_demand_task"),
    processingDestinations: z.array(ProcessingDestination).min(1),
  }),
  z.strictObject({
    ...grantBase,
    kind: z.literal("cloud_processing"),
    processor: z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,63}$/),
    categories: z.array(DataCategory).min(1),
    purpose: z.literal("task_processing"),
    termsVersion: z.string().min(1).max(64),
    processingDestinations: z.array(z.literal("cloud_ai")).length(1),
  }),
]);
export type Grant = z.infer<typeof Grant>;

export const SourceRecord = z.strictObject({
  id: SourceId,
  ownerId: OwnerId,
  kind: z.enum(["source", "derivative"]),
  origin: z.enum([
    "gmail_message",
    "calendar_freebusy",
    "calendar_event",
    "shared_text",
    "shared_url",
    "owner_turn",
    "model_output",
  ]),
  sourceIds: z.array(SourceId),
  connectionId: ConnectionId.nullable(),
  resourceRef: ProviderRef.nullable(),
  grantVersions: z.array(GrantVersionRef),
  policyVersion: Version,
  categories: z.array(DataCategory),
  permittedDestinations: z.array(ProcessingDestination),
  capturedAt: Timestamp,
  expiresAt: Timestamp,
});
export type SourceRecord = z.infer<typeof SourceRecord>;
