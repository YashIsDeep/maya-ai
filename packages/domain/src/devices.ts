import * as z from "zod";
import {
  CoordinatorEpoch,
  DeviceId,
  EventCursor,
  GrantVersionRef,
  LeaseId,
  ObjectRef,
  OwnerId,
  SessionId,
  Timestamp,
  Version,
} from "./primitives.ts";

export const Device = z.strictObject({
  id: DeviceId,
  ownerId: OwnerId,
  name: z.string().min(1).max(64),
  platform: z.enum(["android", "ios", "windows", "macos", "linux"]),
  publicKey: z.strictObject({
    algorithm: z.string().regex(/^[a-z0-9-]{1,32}$/),
    key: z.string().regex(/^[A-Za-z0-9_-]{1,1024}$/),
  }),
  sessionId: SessionId.nullable(),
  capabilities: z.array(z.enum(["approve", "microphone", "notifications", "share_input", "offline_cache", "home_pc"])),
  coordinatorEpoch: CoordinatorEpoch,
  enrolledAt: Timestamp,
  lastSeenAt: Timestamp.nullable(),
  revokedAt: Timestamp.nullable(),
});
export type Device = z.infer<typeof Device>;

export const DeviceCacheLease = z.strictObject({
  id: LeaseId,
  ownerId: OwnerId,
  deviceId: DeviceId,
  coordinatorEpoch: CoordinatorEpoch,
  policyVersions: z.strictObject({
    ownerPolicy: Version,
    grants: z.array(GrantVersionRef),
  }),
  issuedAt: Timestamp,
  leaseDeadline: Timestamp,
  contentDeadlines: z.array(z.strictObject({ object: ObjectRef, expiresAt: Timestamp })),
  lastValidatedCursor: EventCursor,
});
export type DeviceCacheLease = z.infer<typeof DeviceCacheLease>;
