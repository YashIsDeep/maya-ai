import assert from "node:assert/strict";
import { test } from "node:test";
import * as z from "zod";
import {
  ActivityEvent,
  Connection,
  ConversationTurn,
  Execution,
  Grant,
  Memory,
  OwnerId,
  OwnerPolicy,
  Proposal,
  Timestamp,
  Version,
  DOMAIN_OBJECTS,
} from "./index.ts";

const now = "2026-09-26T10:00:00.000Z";
const digest = "sha256:" + "a".repeat(64);
const fixtureOwnerPolicy = {
  ownerId: "owner_1",
  version: 1,
  historyEnabled: false,
  executionStorageConsent: null,
  aiRoute: null,
  processingGrantIds: [],
  disclosedTermsVersion: null,
  updatedAt: now,
};
const fixtureConversation = {
  id: "conversation_1",
  ownerId: "owner_1",
  historyMode: "off",
  retentionDeadline: now,
  turns: [
    {
      id: "turn_1",
      author: "owner",
      taskId: "task_1",
      text: "Please reply to this message.",
      sourceIds: ["source_1"],
      createdAt: now,
    },
  ],
  createdAt: now,
};
const fixtureDevice = {
  id: "device_1",
  ownerId: "owner_1",
  name: "Home PC",
  platform: "windows",
  publicKey: { algorithm: "ed25519", key: "AQIDBA" },
  sessionId: "session_1",
  capabilities: ["approve", "home_pc"],
  coordinatorEpoch: 1,
  enrolledAt: now,
  lastSeenAt: now,
  revokedAt: null,
};
const fixtureConnection = {
  id: "connection_1",
  ownerId: "owner_1",
  version: 1,
  provider: "google",
  account: { subject: "google-subject-1", email: "owner@example.test" },
  tokenRef: "vault:google_primary",
  scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
  state: "connected",
  createdAt: now,
  updatedAt: now,
};
const fixtureGmailGrant = {
  id: "grant_1",
  ownerId: "owner_1",
  version: 1,
  subject: "owner",
  state: "active",
  expiresAt: null,
  createdAt: now,
  kind: "gmail_access",
  connectionId: "connection_1",
  selector: { rollingWindowDays: 30, labelIds: null },
  operations: ["mail.message.read"],
  fieldMask: ["headers", "body"],
  purpose: "on_demand_task",
  processingDestinations: ["home_pc"],
};
const fixtureCalendarGrant = {
  id: "grant_2",
  ownerId: "owner_1",
  version: 1,
  subject: "owner",
  state: "active",
  expiresAt: null,
  createdAt: now,
  kind: "calendar_access",
  connectionId: "connection_1",
  selector: { calendar: "primary" },
  operations: ["calendar.freebusy.read"],
  fieldMask: ["free_busy"],
  purpose: "on_demand_task",
  processingDestinations: ["home_pc"],
};
const fixtureCloudGrant = {
  id: "grant_3",
  ownerId: "owner_1",
  version: 1,
  subject: "owner",
  state: "active",
  expiresAt: null,
  createdAt: now,
  kind: "cloud_processing",
  processor: "anthropic",
  categories: ["task_text"],
  purpose: "task_processing",
  termsVersion: "terms-1",
  processingDestinations: ["cloud_ai"],
};
const fixtureSourceRecord = {
  id: "source_1",
  ownerId: "owner_1",
  kind: "source",
  origin: "gmail_message",
  sourceIds: [],
  connectionId: "connection_1",
  resourceRef: "gmail:message/provider-1",
  grantVersions: [{ grantId: "grant_1", version: 1 }],
  policyVersion: 1,
  categories: ["email_text_and_addresses"],
  permittedDestinations: ["home_pc"],
  capturedAt: now,
  expiresAt: now,
};
const fixtureMemory = {
  id: "memory_1",
  ownerId: "owner_1",
  version: 1,
  text: "Use concise replies.",
  authorization: { kind: "owner_entry", deviceId: "device_1" },
  sourceIds: [],
  permittedDestinations: ["home_pc"],
  retentionDeadline: null,
  createdAt: now,
  updatedAt: now,
};
const fixtureTask = {
  id: "task_1",
  ownerId: "owner_1",
  conversationId: "conversation_1",
  status: "preparing",
  phase: null,
  inputTurnIds: ["turn_1"],
  sourceIds: ["source_1"],
  effectivePolicy: {
    ownerPolicyVersion: 1,
    storageMode: "encrypted",
    keepOnMyDevices: true,
    processingDestinations: ["home_pc"],
  },
  cancellation: null,
  continuesTaskId: null,
  eventCursor: { epoch: 1, sequence: 0 },
  createdAt: now,
  updatedAt: now,
};
const fixtureDraft = {
  id: "draft_1",
  ownerId: "owner_1",
  taskId: "task_1",
  version: 1,
  parentVersion: null,
  text: "Thanks for the update.",
  sourceIds: ["source_1"],
  conflictingVersions: [],
  storageMode: "encrypted",
  createdAt: now,
  expiresAt: now,
};
const fixtureProposal = {
  id: "proposal_1",
  ownerId: "owner_1",
  taskId: "task_1",
  version: 1,
  status: "awaiting_approval",
  operation: { name: "mail.reply.send", schemaVersion: 1, connectorVersion: "1.0.0" },
  replyTarget: { inReplyTo: "source_1", audience: "reply" },
  payloadRef: "payload:proposal_1",
  payloadHash: digest,
  resourceFingerprint: digest,
  grantVersions: [{ grantId: "grant_1", version: 1 }],
  possibleDuplicateOf: null,
  createdAt: now,
  contentDeadline: now,
  reviewDeadline: now,
};
const fixtureApproval = {
  id: "approval_1",
  ownerId: "owner_1",
  proposalId: "proposal_1",
  proposalVersion: 1,
  payloadHash: digest,
  approver: { ownerId: "owner_1", deviceId: "device_1", sessionId: "session_1" },
  decision: "approve",
  challenge: { id: "challenge_1", nonce: "A".repeat(22) },
  coordinator: { id: "coordinator_1", epoch: 1 },
  validFrom: now,
  validUntil: now,
  consumption: "consumed",
  decidedAt: now,
};
const fixtureExecution = {
  id: "execution_1",
  ownerId: "owner_1",
  proposalId: "proposal_1",
  proposalVersion: 1,
  approvalId: "approval_1",
  commandKey: "send:task_1:proposal_1:1",
  consentVersion: 1,
  dispatchDeadline: now,
  claim: null,
  dispatchStartedAt: null,
  attempts: 0,
  correlationId: "<maya.1@example.test>",
  receipt: null,
  evidence: [],
  outcome: "pending",
  payloadDeadline: now,
  evidenceDeadline: now,
};
const fixtureDeviceCacheLease = {
  id: "lease_1",
  ownerId: "owner_1",
  deviceId: "device_1",
  coordinatorEpoch: 1,
  policyVersions: { ownerPolicy: 1, grants: [{ grantId: "grant_1", version: 1 }] },
  issuedAt: now,
  leaseDeadline: now,
  contentDeadlines: [{ object: { type: "task", id: "task_1", version: 1 }, expiresAt: now }],
  lastValidatedCursor: { epoch: 1, sequence: 0 },
};
const fixtureSyncEvent = {
  ownerId: "owner_1",
  coordinatorEpoch: 1,
  sequence: 1,
  kind: "object_changed",
  object: { type: "task", id: "task_1", version: 1 },
  occurredAt: now,
  retentionDeadline: now,
};
const fixtureActivityEvent = {
  id: "activity_1",
  ownerId: "owner_1",
  actor: "owner_session",
  deviceId: "device_1",
  taskId: "task_1",
  connectionId: "connection_1",
  resourceRef: "gmail:message/provider-1",
  operation: "mail.message.read",
  purpose: "on_demand_task",
  processingDestination: "home_pc",
  grantVersions: [{ grantId: "grant_1", version: 1 }],
  approvalId: null,
  proposal: null,
  result: "allowed",
  reasonCode: null,
  occurredAt: now,
  evidenceDeadline: now,
};

const fixtures = {
  ownerPolicy: fixtureOwnerPolicy,
  conversation: fixtureConversation,
  device: fixtureDevice,
  connection: fixtureConnection,
  grant: fixtureGmailGrant,
  sourceRecord: fixtureSourceRecord,
  memory: fixtureMemory,
  task: fixtureTask,
  draft: fixtureDraft,
  proposal: fixtureProposal,
  approval: fixtureApproval,
  execution: fixtureExecution,
  deviceCacheLease: fixtureDeviceCacheLease,
  syncEvent: fixtureSyncEvent,
  activityEvent: fixtureActivityEvent,
} satisfies Record<keyof typeof DOMAIN_OBJECTS, Record<string, unknown>>;

function objectShape(schema: z.ZodType): Record<string, unknown> {
  if (!(schema instanceof z.ZodObject)) {
    throw new Error("Expected an object schema");
  }
  return schema.shape;
}

function isDomainObjectName(name: string): name is keyof typeof DOMAIN_OBJECTS {
  return Object.prototype.hasOwnProperty.call(DOMAIN_OBJECTS, name);
}

function parseFixture(name: keyof typeof fixtures, fixture: unknown): boolean {
  return DOMAIN_OBJECTS[name].safeParse(fixture).success;
}

function changed<T extends Record<string, unknown>>(source: T, key: string, value: unknown): T {
  return { ...structuredClone(source), [key]: value };
}

test("the domain object registry contains exactly the §6 object schemas", () => {
  assert.deepEqual(Object.keys(DOMAIN_OBJECTS), [
    "ownerPolicy",
    "conversation",
    "device",
    "connection",
    "grant",
    "sourceRecord",
    "memory",
    "task",
    "draft",
    "proposal",
    "approval",
    "execution",
    "deviceCacheLease",
    "syncEvent",
    "activityEvent",
  ]);
});

test("each object schema contains its essential fields", () => {
  const essentialFields: Record<Exclude<keyof typeof DOMAIN_OBJECTS, "grant">, string[]> = {
    ownerPolicy: [
      "historyEnabled",
      "executionStorageConsent",
      "aiRoute",
      "processingGrantIds",
      "disclosedTermsVersion",
    ],
    conversation: ["ownerId", "historyMode", "retentionDeadline", "turns"],
    device: ["ownerId", "publicKey", "sessionId", "capabilities", "coordinatorEpoch", "lastSeenAt", "revokedAt"],
    connection: ["ownerId", "provider", "account", "tokenRef", "scopes", "state"],
    sourceRecord: [
      "ownerId",
      "sourceIds",
      "grantVersions",
      "policyVersion",
      "categories",
      "permittedDestinations",
      "capturedAt",
      "expiresAt",
    ],
    memory: ["ownerId", "version", "text", "authorization", "sourceIds", "permittedDestinations", "retentionDeadline"],
    task: [
      "ownerId",
      "conversationId",
      "status",
      "phase",
      "inputTurnIds",
      "sourceIds",
      "effectivePolicy",
      "cancellation",
      "eventCursor",
    ],
    draft: [
      "ownerId",
      "taskId",
      "version",
      "parentVersion",
      "text",
      "sourceIds",
      "conflictingVersions",
      "createdAt",
      "expiresAt",
      "storageMode",
    ],
    proposal: [
      "taskId",
      "version",
      "status",
      "operation",
      "payloadRef",
      "payloadHash",
      "resourceFingerprint",
      "grantVersions",
      "createdAt",
      "contentDeadline",
      "reviewDeadline",
    ],
    approval: [
      "proposalVersion",
      "payloadHash",
      "approver",
      "decision",
      "challenge",
      "validFrom",
      "validUntil",
      "consumption",
    ],
    execution: [
      "proposalId",
      "commandKey",
      "consentVersion",
      "dispatchDeadline",
      "claim",
      "dispatchStartedAt",
      "attempts",
      "correlationId",
      "receipt",
      "evidence",
      "outcome",
      "payloadDeadline",
      "evidenceDeadline",
    ],
    deviceCacheLease: [
      "deviceId",
      "coordinatorEpoch",
      "policyVersions",
      "issuedAt",
      "leaseDeadline",
      "contentDeadlines",
      "lastValidatedCursor",
    ],
    syncEvent: ["ownerId", "coordinatorEpoch", "sequence", "object", "kind", "retentionDeadline"],
    activityEvent: [
      "actor",
      "taskId",
      "connectionId",
      "resourceRef",
      "operation",
      "purpose",
      "processingDestination",
      "grantVersions",
      "approvalId",
      "occurredAt",
      "result",
      "evidenceDeadline",
      "reasonCode",
    ],
  };

  for (const [name, fields] of Object.entries(essentialFields)) {
    assert.ok(isDomainObjectName(name) && name !== "grant");
    const present = Object.keys(objectShape(DOMAIN_OBJECTS[name]));
    for (const field of fields) {
      assert.ok(present.includes(field), name + " is missing " + field);
    }
  }
  assert.ok(Object.keys(objectShape(ConversationTurn)).includes("sourceIds"));
});

test("every grant variant has its required common and kind-specific fields", () => {
  const options = Grant.options;
  const common = ["subject", "purpose", "processingDestinations", "expiresAt", "version", "state"];
  const providerFields = ["connectionId", "selector", "operations", "fieldMask"];
  assert.equal(options.length, 3);

  for (const option of options) {
    const keys = Object.keys(option.shape);
    for (const field of common) {
      assert.ok(keys.includes(field), "grant variant missing " + field);
    }
    if (keys.includes("connectionId")) {
      for (const field of providerFields) {
        assert.ok(keys.includes(field), "provider grant variant missing " + field);
      }
    } else {
      assert.ok(keys.includes("processor"));
      assert.ok(keys.includes("categories"));
      for (const field of providerFields) {
        assert.equal(keys.includes(field), false);
      }
    }
  }
});

test("one valid fixture for each object and each grant kind parses", () => {
  for (const [name, fixture] of Object.entries(fixtures)) {
    assert.ok(isDomainObjectName(name));
    assert.equal(parseFixture(name, fixture), true, name);
  }
  assert.equal(Grant.safeParse(fixtureGmailGrant).success, true);
  assert.equal(Grant.safeParse(fixtureCalendarGrant).success, true);
  assert.equal(Grant.safeParse(fixtureCloudGrant).success, true);
});

test("all fields are required except the documented owner policy default", () => {
  for (const [name, fixture] of Object.entries(fixtures)) {
    assert.ok(isDomainObjectName(name));
    const schema = DOMAIN_OBJECTS[name];
    for (const key of Object.keys(fixture)) {
      if (name === "ownerPolicy" && key === "historyEnabled") {
        continue;
      }
      const missing: Record<string, unknown> = { ...fixture };
      delete missing[key];
      assert.equal(schema.safeParse(missing).success, false, name + " accepted missing " + key);
    }
  }

  for (const fixture of [fixtureGmailGrant, fixtureCalendarGrant, fixtureCloudGrant]) {
    for (const key of Object.keys(fixture)) {
      const missing: Record<string, unknown> = { ...fixture };
      delete missing[key];
      assert.equal(Grant.safeParse(missing).success, false, fixture.kind + " accepted missing " + key);
    }
  }

  const { historyEnabled: _, ...withoutHistory } = fixtureOwnerPolicy;
  assert.equal(OwnerPolicy.parse(withoutHistory).historyEnabled, false);
});

test("strict object schemas reject unknown keys", () => {
  for (const [name, fixture] of Object.entries(fixtures)) {
    assert.ok(isDomainObjectName(name));
    assert.equal(DOMAIN_OBJECTS[name].safeParse({ ...fixture, unexpected: 1 }).success, false, name);
  }
  for (const fixture of [fixtureGmailGrant, fixtureCalendarGrant, fixtureCloudGrant]) {
    assert.equal(Grant.safeParse({ ...fixture, unexpected: 1 }).success, false);
  }
});

test("deferred operations and untrusted memory authorization are rejected", () => {
  assert.equal(Grant.safeParse(changed(fixtureGmailGrant, "fieldMask", ["attachments"])).success, false);
  assert.equal(Grant.safeParse(changed(fixtureGmailGrant, "purpose", "background_monitoring")).success, false);
  assert.equal(Grant.safeParse(changed(fixtureGmailGrant, "operations", ["mail.draft.create"])).success, false);
  assert.equal(Grant.safeParse(changed(fixtureCalendarGrant, "operations", ["calendar.event.create"])).success, false);
  assert.equal(Grant.safeParse(changed(fixtureCalendarGrant, "selector", { calendar: "work" })).success, false);
  assert.equal(
    Connection.safeParse(changed(fixtureConnection, "scopes", ["https://www.googleapis.com/auth/gmail.modify"]))
      .success,
    false,
  );
  assert.equal(
    Proposal.safeParse(
      changed(fixtureProposal, "operation", {
        name: "mail.message.read",
        schemaVersion: 1,
        connectorVersion: "1.0.0",
      }),
    ).success,
    false,
  );
  assert.equal(
    Memory.safeParse(changed(fixtureMemory, "authorization", { kind: "model", deviceId: "device_1" })).success,
    false,
  );
});

test("cloud processing grants permit exactly one cloud AI destination", () => {
  assert.equal(Grant.safeParse(changed(fixtureCloudGrant, "processingDestinations", ["home_pc"])).success, false);
  assert.equal(Grant.safeParse(changed(fixtureCloudGrant, "processingDestinations", [])).success, false);
  assert.equal(
    Grant.safeParse(changed(fixtureCloudGrant, "processingDestinations", ["cloud_ai", "cloud_ai"])).success,
    false,
  );
});

test("grant kinds do not accept another provider kind's fields", () => {
  assert.equal(Grant.safeParse(changed(fixtureGmailGrant, "fieldMask", ["free_busy"])).success, false);
});

test("wire formats enforce UTC millisecond timestamps and opaque references", () => {
  assert.equal(Timestamp.safeParse(now).success, true);
  assert.equal(Timestamp.safeParse("2026-09-26T10:00:00.000+05:30").success, false);
  assert.equal(Timestamp.safeParse("2026-09-26T10:00:00Z").success, false);
  assert.equal(OwnerId.safeParse("owner/1").success, false);
  assert.equal(Version.safeParse(0).success, false);
  assert.equal(
    ActivityEvent.safeParse(changed(fixtureActivityEvent, "reasonCode", "Re: Launch review")).success,
    false,
  );
  assert.equal(
    ActivityEvent.safeParse(changed(fixtureActivityEvent, "resourceRef", "Re: Launch review")).success,
    false,
  );
  assert.equal(Execution.safeParse(changed(fixtureExecution, "correlationId", "launch review")).success, false);
  assert.equal(Connection.safeParse(changed(fixtureConnection, "tokenRef", "token:secret")).success, false);
});

test("all domain object schemas export to draft 2020-12 JSON Schema", () => {
  for (const [name, schema] of Object.entries(DOMAIN_OBJECTS)) {
    const jsonSchema = z.toJSONSchema(schema, {
      target: "draft-2020-12",
      unrepresentable: "throw",
    });
    assert.ok(jsonSchema, name);
    assertStrictObjects(jsonSchema, name);
  }
});

function assertStrictObjects(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    for (const [index, child] of value.entries()) {
      assertStrictObjects(child, path + "[" + index + "]");
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  if (value.type === "object") {
    assert.equal(value.additionalProperties, false, path);
  }
  for (const [key, child] of Object.entries(value)) {
    assertStrictObjects(child, path + "." + key);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
