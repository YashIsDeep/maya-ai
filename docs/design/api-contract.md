# Coordinator API contract

**Status:** design, M0-04 (26 September 2026). **Sources:** technical blueprint §1, §2, §3, §4, §5, §6,
§7; product blueprint §3, §4, §5, §7. **Schemas:** packages/domain (objects and state machines in
M0-04; request, response and view schemas plus the endpoint registry in M0-04a). Where this document and
a blueprint disagree, the blueprint wins and this document is corrected through a task.

## 1. Principles

- These are **logical endpoints** on the local coordinator, carried over authenticated local IPC on the
  Home PC or over the encrypted device transport (FD-19) for paired devices. There is no
  unauthenticated localhost API. `METHOD /path` names an operation; it does not require HTTP.
- Clients and the model reach coordinator state through this contract and the additions listed in §8.
  Each §8 item is written into this document through §9 before it is built; until then no client or model
  can perform it. New interfaces (voice, widgets, share sheets, future connector protocols) use these
  endpoints and add no write path.
- **Internal interfaces are not part of this contract** and are not reachable by clients or the model:
  the orchestrator records Maya's turns (answers and clarification questions) and task phases (FD-16a,
  FD-16b); the read broker serves validated typed read requests (FD-09, FD-10); the executor accepts only
  coordinator-created commands (VS-04, FD-07).
- **No send bypass.** No endpoint accepts outbound message content for dispatch, MIME bytes, dispatch
  recipients, a payload hash, deadlines, or a provider request. There is no /send, /send-email, /execute, /commands, batch or standing approval, raw-token, or generic HTTP/proxy endpoint, for any
  actor. The only path to an external write is: draft → `POST /tasks/{id}/proposals` (trusted validation
  and freezing) → `POST /proposals/{id}/decisions` by an owner session → a command created by the
  coordinator in the same transaction as the approval → the executor.
- **Deferred 1.0 capabilities are unrepresentable.** Operation, scope, field, purpose and selector enums
  list only 1.0 values. A request naming anything else fails validation; FD-21 adds
  `capability_unavailable` for registry-level denials.
- Approvals are never inferred from a provider scope, a notification, voice, or a reconnect.

## 2. Actors

The coordinator derives the actor from the authenticated channel, never from the request. No request
body carries an owner, device, session or actor identity.

| `Actor` | Who |
|---|---|
| `owner_session` | The owner's authenticated session on an enrolled, unrevoked device whose coordinator epoch is current. **Home PC** below means the device has the `home_pc` capability. |
| `pairing_candidate` | An unenrolled client presenting a live pairing offer (QR code or the accessible alternative). It can only join that offer. |
| planner | The assistant planner (model tool path) inside the coordinator, acting for exactly one task. |
| `read_broker`, executor | Service identities. They call no endpoint in this contract. |
| coordinator | Trusted internal jobs (deadlines, reconciliation, cleanup, revocation fan-out). They call no endpoint in this contract. |

- Only `owner_session` can decide; enroll or remove devices; change owner policy, connections, grants or
  a task's processing; add task input; remove task context; write memory; cancel; review again; or check
  status.
- planner may call two endpoints (10 and 11), only for its own task and only while that task is
  `preparing`. Content it has read (email, calendar, shared text, model output) is untrusted and can never
  become a grant, an approval, a recipient, a policy change or a memory note.
- A decision additionally requires that the session's device has the approve capability and returns a
  valid challenge response for the exact proposal version. Notifications and voice cannot approve.
- A caller not on an endpoint's allowlist gets `forbidden_actor`; the call has no effect and is recorded
  in Activity as a denial.

## 3. Conventions

- **Encoding.** JSON. Field names `camelCase`; enum values `snake_case`. Unknown fields are rejected
  (`validation_failed`). There are no optional fields: an absent value is `null`.
- **IDs.** Opaque, coordinator-generated, [A-Za-z0-9_-]{1,64}. Clients mint only `clientRequestId`
  ([A-Za-z0-9_-]{16,64}, one per user action).
- **Time.** RFC 3339 UTC with millisecond precision and Z (2026-09-26T10:00:00.000Z), from the
  coordinator clock. The coordinator owns every deadline; clients display deadlines and cannot set or
  extend them.
- **Versions.** Integers from 1. A change to a versioned object carries `expectedVersion`. A mismatch
  returns `version_conflict` with the latest authorized view and applies nothing (drafts: see endpoint 10).
- **Idempotency.** Creates, task input, cancels and Review again carry `clientRequestId`; a repeat within
  24 hours returns the original result and has no new effect. Decisions are idempotent per owner +
  proposal + version without a request id. PUT and DELETE requests are idempotent by their content.
- **Owner isolation.** Every lookup is scoped to the caller's owner. Another owner's object is
  `not_found`.
- **Content eligibility.** A response includes content only while it is eligible under technical §7
  (retention, grants, storage mode, device lease). Otherwise the content field is `null` or the item is
  omitted, and `contentAvailable` is `false`. Expired content is never reconstructed.
- **Offline.** Clients never queue a decision for later submission. A lost acknowledgement is resolved by
  reading the task or proposal after reconnecting, never by submitting a new decision for another
  version.
- **Reachability** is a client transport state. When a call cannot complete, the client shows **Can't
  reach your Home PC**; it never infers shutdown, failure or cancellation from that.

### 3.1 Errors

Every error is { error: { code: `ErrorCode`, `nextStep`: `NextStep`, latest: View | `null` } }. There is no
free-text message field; clients map code and `nextStep` to product wording.

| code | Status | Meaning |
|---|---|---|
| `validation_failed` | 400 | Malformed body, unknown field, or a value outside the 1.0 enums |
| unauthenticated | 401 | No valid session, a revoked device, or an invalid challenge response |
| `forbidden_actor` | 403 | Caller not on the endpoint's allowlist |
| `home_pc_required` | 403 | This step must run on the Home PC (`nextStep`: `finish_on_pc`) |
| `not_found` | 404 | No such object for this owner |
| `version_conflict` | 409 | Stale `expectedVersion` or proposal version; latest is the current authorized view |
| `invalid_state` | 409 | Not allowed from the current state (see §6); latest included |
| `epoch_mismatch` | 409 | The coordinator epoch changed (restore or migration); `nextStep`: resync |
| `deadline_passed` | 410 | A review, content, dispatch or pairing deadline has passed |
| `access_required` | 422 | Missing grant, scope, reauthorization or AI route; `nextStep` says which |
| `storage_consent_required` | 422 | Sends need execution-storage consent (`nextStep`: `give_storage_consent`) |
| `capability_unavailable` | 422 | Not a 1.0 capability |

`NextStep` is one of none, `provide_input`, `continue_task`, `review_again`, `check_gmail`,
`reconnect_google`, `finish_on_pc`, `turn_on_replies`, `give_storage_consent`, `choose_ai_route`,
`resolve_draft_conflict`, resync.

## 4. Shared views

Domain objects (`Task`, `Draft`, `Proposal`, …) are the packages/domain schemas. Views combine them:

```text
ClientConnection = Connection without tokenRef
ClientProposal   = Proposal without payloadRef

TaskView = {
  task: Task,
  draft: Draft | null,                  // the task's current draft version, if still eligible
  conflicts: Draft[],                   // still-eligible versions listed in draft.conflictingVersions
  proposal: { id: ProposalId, version: Version, status: ProposalStatus,
              reviewDeadline: Timestamp } | null,        // current version
  execution: { id: ExecutionId, outcome: ExecutionOutcome, dispatchStartedAt: Timestamp | null,
               receipt: Receipt | null } | null,
  contentAvailable: boolean,
  nextStep: NextStep
}

ConversationSummary = {
  id: ConversationId, historyMode: "off" | "on",
  preview: string | null,               // first owner-authored turn, at most 200 characters; null if not eligible
  lastTurnAt: Timestamp | null, activeTaskIds: TaskId[], createdAt: Timestamp
}

ConversationView = {
  conversation: Conversation,           // only still-eligible turns, in order
  tasks: TaskView[],                    // tasks of this conversation still held by the coordinator
  contentAvailable: boolean             // false when any turn was omitted as no longer eligible
}

ProposalView = {
  proposal: ClientProposal,
  review: MailReplyReview | null,       // null when the payload is no longer eligible
  contentAvailable: boolean,
  challenge: { id: ChallengeId, nonce: string, expiresAt: Timestamp } | null
}

Address = { address: EmailAddress, displayName: string | null }

MailReplyReview = {                     // built from the frozen payload the executor will send
  operation: "mail.reply.send",
  account: EmailAddress,                // connected account
  from: EmailAddress,                   // verified primary address
  to: Address[], cc: Address[], bcc: Address[],
  replyToMismatch: { from: Address[], replyTo: Address[] } | null,
  subject: string,
  body: string,                         // complete, including signature and quoted text
  threadId: string, threadSubject: string,
  attachments: "none",
  schedulingCheck: {
    calendar: "primary", start: Timestamp, end: Timestamp, timeZone: string,  // IANA
    checkedAt: Timestamp,
    result: "no_busy_time" | "busy" | "partial" | "error",
    otherCalendarsChecked: false
  } | null,
  effects: ("sends_now" | "stores_sent_copy" | "no_calendar_event" | "cannot_unsend")[],
  limitations: ("availability_can_change" | "provider_adds_routing_headers"
                | "not_a_reservation")[],
  reviewDeadline: Timestamp,
  dispatchWindowSeconds: number,        // proposed default 60, coordinator-owned
  possibleDuplicate: boolean,           // true when proposal.possibleDuplicateOf is set
  explanation: string | null            // model-written; shown only beside the concrete fields
}

AccessSelection = {
  mail: { rollingWindowDays: number | null, labelIds: string[] | null,
          fields: ("headers" | "body")[], replies: boolean } | null,   // null = mail off
  calendar: "free_busy" | "event_details" | null,                      // null = calendar off
  expiresAt: Timestamp | null
}

AccessView = {
  policy: OwnerPolicy,
  processingGrants: Grant[],
  connections: {
    connection: ClientConnection,
    grants: Grant[],
    summary: {                          // built from actual granted capabilities
      mailRead: { rollingWindowDays: number | null } | null,
      replies: "enabled" | "off" | "needs_reauthorization" | "needs_storage_consent",
      calendar: "free_busy" | "event_details" | null,
      monitoring: "unavailable_in_1_0",
      lastUsedAt: Timestamp | null,
      expiresAt: Timestamp | null
    }
  }[]
}

StatusView = {
  coordinator: { id: CoordinatorId, epoch: CoordinatorEpoch },
  storageMode: StorageMode,
  aiRoute: { selected: "cloud_ai" | "on_this_pc" | null,
             readiness: "ready" | "not_ready" | "not_configured",
             processingLocation: "home_pc" | "cloud_ai" | null },
  capabilities: { connectionId: ConnectionId, operation: OperationName, available: boolean,
                  reason: CodeName | null, nextStep: NextStep }[],
  nextStep: NextStep
}

SharedContext = { kind: "text" | "url", text: string (1..100000) }   // a URL is text only

PairingMessage = { protocol: string, payload: string }   // base64url; defined by SP-05 / FD-04

SyncStreamItem = { kind: "event", event: SyncEvent }
               | { kind: "snapshot_required", reason: "epoch_changed" | "cursor_expired" }
```

## 5. Endpoints

| # | Endpoint | Allowed actors |
|---|---|---|
| 1 | `POST /tasks` | `owner_session` |
| 2 | `GET /tasks/{id}` | `owner_session` |
| 3 | `GET /conversations` | `owner_session` |
| 4 | `GET /conversations/{id}` | `owner_session` |
| 5 | `GET /events` (subscription) | `owner_session` |
| 6 | `GET /snapshot` | `owner_session` |
| 7 | `POST /tasks/{id}/input` | `owner_session` |
| 8 | `PUT /tasks/{id}/processing` | `owner_session` |
| 9 | `DELETE /tasks/{id}/sources/{sourceId}` | `owner_session` |
| 10 | `PUT /tasks/{id}/draft` | `owner_session`; planner (own task, `preparing`) |
| 11 | `POST /tasks/{id}/proposals` | `owner_session`; planner (own task, `preparing`, audience: reply only) |
| 12 | `GET /proposals/{id}` | `owner_session` |
| 13 | `POST /proposals/{id}/decisions` | `owner_session` with the approve capability |
| 14 | `POST /tasks/{id}/cancel` | `owner_session` |
| 15 | `POST /tasks/{id}/review-again` | `owner_session` |
| 16 | `POST /tasks/{id}/status-check` | `owner_session` |
| 17 | `GET /memory` | `owner_session` |
| 18 | `POST /memory` | `owner_session` |
| 19 | `PUT /memory/{id}` | `owner_session` |
| 20 | `DELETE /memory/{id}` | `owner_session` |
| 21 | `GET /status` | `owner_session` |
| 22 | `PUT /owner-policy` | `owner_session` |
| 23 | `GET /access` | `owner_session` |
| 24 | `POST /connections` | `owner_session` (Home PC) |
| 25 | `POST /connections/{id}/access` | `owner_session` (Home PC when new provider scopes are needed) |
| 26 | `POST /connections/{id}/controls` | `owner_session` |
| 27 | `GET /devices` | `owner_session` |
| 28 | `POST /pairing/offers` | `owner_session` |
| 29 | `POST /pairing/offers/{id}/join` | `pairing_candidate` (holding that offer) |
| 30 | `POST /pairing/offers/{id}/confirm` | `owner_session` (the device that created the offer) |
| 31 | `DELETE /devices/{id}` | `owner_session` |
| 32 | `GET /activity` | `owner_session` |

`read_broker`, executor and coordinator are on no allowlist.

### 5.1 Tasks and conversations

**1. `POST /tasks`**: start a task from the owner's typed text or final local transcript.

- Request: { `clientRequestId`, `conversationId`: `ConversationId` | `null`, text: string (1..100000),
  `sharedContext`: `SharedContext`[] (max 10), `keepOnMyDevices`: boolean }
- Response: 201 { task: `TaskView` } (200 with the same task on a repeated `clientRequestId`).
- Rules: records an owner-authored turn (with this task's `taskId`) and creates the task in
  `preparing`; a `null` `conversationId` starts a conversation. Shared context becomes untrusted
  SourceRecords (`shared_text`, `shared_url`); a URL is text only and is never fetched, previewed or
  followed. Storage mode follows owner policy: without execution-storage consent the task is
  `memory_only`.
- Errors: `not_found` (conversation), `access_required` with `choose_ai_route` when no usable AI route.

**2. `GET /tasks/{id}`**: 200 { task: `TaskView` }.

**3. `GET /conversations`**: { before: `Timestamp` | `null`, limit: 1..100 } → 200 { conversations:
`ConversationSummary`[], `nextBefore`: `Timestamp` | `null` }, newest `lastTurnAt` first. Only conversations
the coordinator still holds under the storage mode and history setting are listed.

**4. `GET /conversations/{id}`**: 200 `ConversationView`. Maya's answers, including read-only answers
(`read_only_answer_complete`) and clarification questions for a `blocked` task, are maya turns carrying
the task's `taskId`.

**5. `GET /events`**: ordered event subscription.

- Request: { after: `EventCursor` | `null` }.
- Stream: `SyncStreamItem` values in sequence order. Events are references only (no content); clients
  fetch views with endpoints 2, 4, 12, 17 and 23. `snapshot_required` is sent when the epoch changed or
  the cursor is older than the retained log; the client then calls endpoint 6.
- Rules: clients apply `policy_changed` and deleted events before showing cached content or replaying
  edits (FD-17b). Events for `memory_only` tasks are delivered live and not retained after the task ends.

**6. `GET /snapshot`**: 200 { cursor: `EventCursor`, policy: `OwnerPolicy`, conversations:
`ConversationSummary`[], tasks: `TaskView`[], tombstones: `SyncEvent`[] }, policy-filtered: active tasks and
still-eligible recent ones.

**7. `POST /tasks/{id}/input`**: answer a clarification, add context, or continue after providing
access.

- Request: { `clientRequestId`, text: string (1..100000) | `null`, `sharedContext`: `SharedContext`[] (max 10) }
- Response: 200 { task: `TaskView` }.
- Rules:
  - Allowed in `blocked` and `preparing`; other states: `invalid_state`.
  - A non-`null` text is recorded as an owner-authored turn with this `taskId`; shared context becomes
    untrusted SourceRecords added to the task, as in endpoint 1.
  - In `blocked`, the task moves to `preparing` (`input_or_access_provided`). text: `null` with empty
    `sharedContext` is Continue: the owner provided the missing access elsewhere (for example
    Reconnect Google, Turn on replies, execution-storage consent). Preparation then runs under current
    policy; it never revives an old proposal, approval or command. If the block still applies,
    preparation returns the task to `blocked` with the matching `nextStep`.
  - In `preparing`, there is no transition; at least one of text or `sharedContext` must be present,
    otherwise `validation_failed`. The planner sees the input on its next step.

**8. `PUT /tasks/{id}/processing`**: change "Keep on my devices" for this task.

- Request: { `keepOnMyDevices`: boolean }. Response: 200 { task: `TaskView` }.
- Rules:
  - Allowed in `preparing`, `blocked` and `awaiting_approval`; other states: `invalid_state`. It causes
    no state transition.
  - `true` removes `cloud_ai` from the task's processing destinations under a new effective policy,
    cancels undispatched cloud requests and fences late results under the old policy version. Content
    already uploaded is not recalled; Activity keeps the earlier upload and its destination. If the
    on-PC route is not ready, the change still applies; the task's next model step blocks it
    (`needs_input_access_or_home_pc`) with `nextStep`: `choose_ai_route`. There is never a silent fallback
    to cloud AI.
  - `false` requires owner policy with the `cloud_ai` route and an active `cloud_processing` grant,
    otherwise `access_required` with `choose_ai_route`. Cloud processing stays limited to that grant's
    categories.

**9. `DELETE /tasks/{id}/sources/{sourceId}`**: remove a context chip.

- Request: {}. Response: 200 { task: `TaskView` }.
- Rules:
  - Allowed in `preparing`, `blocked` and `awaiting_approval`; other states: `invalid_state`. The source
    must be in the task's `sourceIds` (otherwise `not_found`).
  - The source leaves `Task`.`sourceIds` and is excluded from all later reads, prompt assembly and
    proposal preparation for this task; in-flight reads and model requests that include it are fenced.
  - In `awaiting_approval`, the current proposal version is `superseded` and the task returns to
    `preparing` (`edited_or_context_stale`).
  - Removal does not erase the source or content already derived from it. Erasure is **Forget this**
    (§8).

**10. `PUT /tasks/{id}/draft`**: create or edit the task's draft.

- Request: { `expectedVersion`: `Version` | `null`, text: string (0..100000) }. `null` creates the first
  draft and conflicts if one exists.
- Response: 200 { draft: `Draft`, task: `TaskView` }.
- Rules:
  - `owner_session` may edit in `preparing`, `blocked` or `awaiting_approval`. An edit in
    `awaiting_approval` supersedes the current proposal version and returns the task to `preparing`
    (`edited_or_context_stale`); a new review needs endpoint 11. Other states: `invalid_state`.
  - planner may write only in `preparing`, only for its own task.
  - `Draft` versions are numbered in creation order. The coordinator tracks the task's current
    version, and `expectedVersion` is always checked against it. A successful write creates the next
    version, which becomes current with empty `conflictingVersions`.
  - The coordinator computes `sourceIds`: an owner edit keeps the parent's lineage; a planner draft gets
    the sources the planner actually read in this task. Request bodies carry no lineage. `expiresAt` is
    the earliest applicable source or content deadline; editing never extends it.
  - On a stale `expectedVersion` from `owner_session`, the submitted text is kept as the next version
    number with `parentVersion` set to the stale `expectedVersion`, within its original deadlines. It
    does not become current: the current version's `conflictingVersions` lists it and `TaskView`.conflicts
    returns it. The response is `version_conflict` with the latest `TaskView` and `nextStep`:
    `resolve_draft_conflict`. The owner resolves by saving the chosen text against the current version. A stale planner write is discarded.

**11. `POST /tasks/{id}/proposals`**: ask trusted validation to freeze a proposal.

- Request: { `draftId`: `DraftId`, `draftVersion`: `Version`, operation: "mail.reply.send",
  `inReplyTo`: `SourceId`, audience: "reply" | "`reply_all`" }
- Response: 201 { proposal: `ProposalView`, task: `TaskView` }.
- Rules:
  - Allowed only in `preparing`, for the current draft version. audience: "`reply_all`" is an explicit
    owner choice: planner gets `forbidden_actor`.
  - `inReplyTo` must be a permitted `gmail_message` source in this task's `sourceIds`. Recipients are
    resolved from that message's valid Reply-To addresses, or From if Reply-To is absent, never from
    message bodies, model output or the request. Cc and Bcc are empty for reply.
  - The coordinator checks grants, the gmail.send scope, execution-storage consent and the draft's
    eligibility; freezes the complete MIME bytes, sending account (verified primary address) and thread;
    computes `payloadHash` and `resourceFingerprint`; records `replyTarget`; sets `contentDeadline` and
    `reviewDeadline` (proposed default 10 minutes); and stores a new proposal version in
    `awaiting_approval`. The task moves to `awaiting_approval` (`proposal_validated`). No provider
    mutation happens.
  - Malformed or ambiguous headers, missing consent, missing scope or missing access put the task in
    `blocked` (`needs_input_access_or_home_pc`) and return `validation_failed`,
    `storage_consent_required` or `access_required` with the matching `nextStep`.
  - The request carries no recipients, subject, body, bytes, hash or deadlines.

**12. `GET /proposals/{id}`**: 200 `ProposalView`; query { version: `Version` | `null` } (`null` = current).

- review is built from the frozen payload and shows every field of product §5 "What every approval
  shows".
- challenge is present only when the version is current and `awaiting_approval` and the session's
  device has approve. The coordinator issues one live challenge per session and version (repeated
  reads return the same one), bound to that session and version and expiring at `reviewDeadline`.
  Issuing it is this endpoint's only side effect.

**13. `POST /proposals/{id}/decisions`**: approve or reject one exact proposal version.

- Request: { `proposalVersion`: `Version`, decision: "approve" | "reject", `challengeId`: `ChallengeId`,
  `challengeResponse`: string }. The challenge response is the device's signature over the challenge
  (construction fixed by SP-05 and VS-03). The schema is strict: recipients, subject, body, payload,
  hash, deadlines or grants in the body are `validation_failed`.
- Response: 201 { approval: `Approval`, task: `TaskView` }; a duplicate returns 200 with the existing
  approval and command.
- **Binding.** The coordinator builds the approval from persisted records, never from a client-supplied
  hash. The record copies the payload hash, the challenge id and nonce, the coordinator id and epoch, the
  validity window and the approving device and session. Through its immutable (proposal id, version)
  reference it is also bound to that version's operation and connector/schema version, grant versions,
  resource fingerprint and deadlines, which a version never changes.
- **Approve requires:** the version is current and `awaiting_approval`; the challenge is valid, unexpired,
  unused and bound to this session and version (otherwise unauthenticated, no transition); grants and
  the gmail.send scope are current; execution-storage consent is granted; the review deadline has not
  passed; and the resource recheck, which uses permitted reads only, passes.
- **On success**, one transaction records the decision, consumes the one-use authorization and creates
  the execution command: proposal `approved`, task `approved` (`approval_consumed`).
- **A `failed` recheck** retires the version and changes nothing else:
  - a material change in the thread or calendar context: task `awaiting_approval` → `preparing`
    (`edited_or_context_stale`), proposal `superseded`; `version_conflict` with `nextStep`: `review_again`;
  - a permission the proposal needs is gone (grant revoked, paused or narrowed, send scope missing,
    execution-storage consent withdrawn): task `awaiting_approval` → `cancelled`
    (`rejected_cancelled_or_revoked`), proposal `cancelled`; `access_required` or
    `storage_consent_required` with the matching `nextStep`;
  - the review deadline has passed: task `awaiting_approval` → `expired` (`review_deadline_passed`),
    proposal `expired`; `deadline_passed` with `nextStep`: `review_again`.
- **Duplicates.** Unique per owner + proposal + version: a repeat returns the existing decision and command
  and never creates a second command. A decision on a `superseded`, `cancelled`, `expired` or `dispatched`
  version is `invalid_state` (`deadline_passed` if `expired`) with the latest view.
- **reject** cancels the version and the task (`rejected_cancelled_or_revoked`). The approval card's
  **Cancel** sends reject for the displayed version.

**14. `POST /tasks/{id}/cancel`**

- Request: { `clientRequestId` }.
- Response: 200 { task: `TaskView`, result: "`cancelled`" | "`past_dispatch`" | "`already_finished`" }.
- Rules: serialized with the executor's dispatch claim.
  - From `preparing` or `blocked`: → `cancelled` (`user_cancelled`).
  - From `awaiting_approval`: → `cancelled` (`rejected_cancelled_or_revoked`).
  - From `approved`: → `cancelled` (`cancelled_or_revoked_before_dispatch_claim`), and the undispatched
    command is retired.
  - After the claim (`executing`, `outcome_unknown`, `unresolved`) the state is unchanged, the result is
    `past_dispatch`, and the client says the action may still complete. Terminal states return
    `already_finished`.
  - The coordinator records `requestedAt` and `acknowledgedAt`. A client shows **Cancellation pending**
    until it receives this response.

**15. `POST /tasks/{id}/review-again`**

- Request: { `clientRequestId` }.
- Response: 201 { task: `TaskView` }, either the same task or a new one whose `continuesTaskId` is this
  task.
- Rules:
  - From `awaiting_approval`: the current version is `superseded` and the task returns to `preparing`
    (`edited_or_context_stale`). The coordinator then revalidates access and context and prepares a
    fresh proposal from the current draft with the previous `replyTarget`, exactly as endpoint 11 would:
    → `awaiting_approval` (`proposal_validated`) or → `blocked` (`needs_input_access_or_home_pc`).
  - From `expired`, `failed` or `unresolved`: a new task in the same conversation starts in `preparing`
    with a copy of the latest still-eligible draft, keeping its original deadlines. If the earlier task
    had a proposal, the coordinator prepares one with the same `replyTarget` as above; if that message
    is no longer a permitted source, the new task is `blocked` with `nextStep`: `provide_input`. If the
    earlier task had no proposal, the planner continues in `preparing`. From `unresolved`, the new
    proposal's `possibleDuplicateOf` is the earlier execution and its review warns about a possible
    duplicate.
  - It never approves or sends. Other states: `invalid_state`. No eligible draft left:
    `deadline_passed`, and no task is created.

**16. `POST /tasks/{id}/status-check`**: **Check again**.

- Request: {}. Response: 200 { task: `TaskView` }.
- Rules: allowed in `outcome_unknown` and `unresolved`; other states: `invalid_state`.
  - It runs one bounded check using only the reply-status read purpose (correlation id, account, time
    window, required Sent fields).
  - It moves the task to `succeeded` or `failed` only on verified evidence (`confirmed_by_reconciliation`
    or `confirmed_not_performed` from `outcome_unknown`; `verified_acceptance_evidence` or
    `verified_non_execution_evidence` from `unresolved`).
  - Otherwise the state is unchanged, except that `outcome_unknown` becomes `unresolved`
    (`reconciliation_exhausted`) when the check budget is exhausted or reconciliation access is missing
    (`nextStep`: `check_gmail`).
  - It creates no command and cannot send.

### 5.2 `Memory`

**17. `GET /memory`**: 200 { notes: `Memory`[] }.

**18. `POST /memory`**

- Request: { text: string (1..2000), authorization: { kind: "`direct_instruction`", `turnId`: `TurnId` }
  | { kind: "`confirmed_interpretation`", `turnId`: `TurnId` } | { kind: "`owner_entry`" } }
- Response: 201 { note: `Memory` }. The client echoes the saved text with **Undo**, which calls
  endpoint 20 with `expectedVersion`: 1.
- Rules:
  - `direct_instruction` requires an owner-authored turn of this owner in which text appears verbatim,
    otherwise `validation_failed`.
  - `confirmed_interpretation` is the owner confirming the exact text shown on screen for that turn.
  - `owner_entry` is typed in Settings.
  - The coordinator computes `sourceIds`, destinations and retention from the turn's lineage.
  - The planner has no memory endpoint: a model-proposed note reaches the owner only as a suggestion in
    chat.

**19. `PUT /memory/{id}`**: { `expectedVersion`, text } → 200 { note: `Memory` }, recorded as `owner_edit`.
Lineage and destination restrictions are preserved.

**20. `DELETE /memory/{id}`**: { `expectedVersion` } → 200 { id: `MemoryId` }; emits a deleted event.

### 5.3 Status, policy and access

**21. `GET /status`**: 200 `StatusView`. Capability summaries, processing readiness, storage mode and
reauthorization needs are structured so every client shows the same next step.

**22. `PUT /owner-policy`**: the "How Maya thinks" and Privacy choices.

- Request: { `expectedVersion`, `historyEnabled`: boolean,
  `executionStorageConsent`: "granted" | "declined" | `null`, `consentTermsVersion`: string | `null`,
  `aiRoute`: "`cloud_ai`" | "`on_this_pc`" | `null`,
  `cloudProcessing`: { processor: string, categories: `DataCategory`[], `termsVersion`: string } | `null` }
- Response: 200 { policy: `OwnerPolicy` }.
- Rules:
  - This explicit owner choice authorizes exactly this internal change.
  - `executionStorageConsent` may be `null` only while no choice has been made; a choice requires
    `consentTermsVersion`.
  - `cloud_ai` requires `cloudProcessing`, which is compiled into a new `cloud_processing` grant (the
    previous one is revoked); `event_details` is included only if listed.
  - `on_this_pc` requires local readiness, otherwise `access_required` with `choose_ai_route`; there is
    never a silent fallback.
  - Leaving cloud processing cancels undispatched cloud requests and fences late results.
  - Declining consent disables sends, makes new tasks `memory_only`, and has the side effects in §6.2.

**23. `GET /access`**: 200 `AccessView`.

**24. `POST /connections`**: connect the Google account.

- Request: { provider: "google", selection: `AccessSelection` }.
- Response: 201 { connection: `ClientConnection` } in authorizing. The Home PC opens the system
  browser; completion arrives as a sync event.
- Rules:
  - Home PC only (`home_pc_required` with `finish_on_pc` elsewhere). A second Google account is
    `capability_unavailable`.
  - selection.mail.replies: `true` requires granted execution-storage consent
    (`storage_consent_required`).
  - The submitted selection is the owner's confirmation. After authorization, the coordinator verifies
    the returned account and scopes and compiles grants only for capabilities actually granted (partial
    consent enables only those).
  - A mismatched account never replaces an existing connection.

**25. `POST /connections/{id}/access`**: Change access, Turn on replies, or event details.

- Request: { `expectedVersion`, selection: `AccessSelection` }.
- Response: 200 { connection: `ClientConnection`, grants: `Grant`[] }.
- Rules:
  - Narrowing applies at once and invalidates out-of-scope caches, excerpts and memories; affected
    proposals and commands follow §6.2.
  - Widening that needs new provider scopes runs a new full-scope authorization on the Home PC (the
    connection goes to authorizing; `home_pc_required` elsewhere).
  - Every change creates new grant versions (§6.2). Restored or widened access never revives an old
    approval or command, and never moves a `blocked` task by itself: the owner continues with endpoint 7.

**26. `POST /connections/{id}/controls`**

- Request: { `expectedVersion`, action: "pause" | "resume" | "`turn_off_replies`" | "disconnect",
  `deleteSavedContent`: boolean | `null` }. `deleteSavedContent` is required for disconnect and `null`
  otherwise.
- Response: 200 { connection: `ClientConnection`, grants: `Grant`[], `affectedServices`: ("gmail" |
  "calendar")[], `pendingProviderSteps`: CodeName[] }.
- Rules:
  - Revocation follows technical §2 and §6.2: it atomically denies new work, increments the policy
    version, invalidates pending approvals, cancels undispatched commands, stops subscriptions and
    fences in-flight reads and model responses.
  - pause and `turn_off_replies` deny locally and do not claim to narrow the Google token.
  - disconnect removes local credentials, attempts provider revocation and denies retrieval of saved
    copies at once.
  - resume never revives approvals or commands.
  - A send already past the dispatch claim may still complete.
  - Clients show the request as pending until this response arrives.

### 5.4 Devices and pairing

**27. `GET /devices`**: 200 { devices: `Device`[] }.

**28. `POST /pairing/offers`**: {} → 201 { `offerId`: string, `expiresAt`: `Timestamp`, offer:
`PairingMessage` }, shown as a QR code and as the accessible alternative. The offer has a short expiry.

**29. `POST /pairing/offers/{id}/join`**: { message: `PairingMessage`, `deviceName`: string (1..64),
platform: Platform } → 200 { message: `PairingMessage` }. Both screens then show the same short code.
Replays and `expired` offers get `deadline_passed`.

**30. `POST /pairing/offers/{id}/confirm`**: { `codesMatch`: boolean } → 200 { device: `Device` | `null` }.
`true` enrolls the device; `false` cancels the offer. Only the device that created the offer may
confirm.

**31. `DELETE /devices/{id}`**: {} → 200 { device: `Device` } with `revokedAt` set.

- It invalidates the device's sessions, challenges and pending approvals (§6.2).
- It denies further sync once acknowledged.
- Retained revocation evidence rejects the old key.

### 5.5 Activity

**32. `GET /activity`**: { before: `Timestamp` | `null`, limit: 1..200 } → 200 { events: `ActivityEvent`[],
`nextBefore`: `Timestamp` | `null` }.

- Activity events carry references and reason codes, never subjects, bodies or credentials.
- Clients show **Reviewed content no longer stored** when the referenced content is gone.

## 6. State transitions caused by endpoints

The allowed transitions are the tables in packages/domain/src/state-machines.ts: the task machine
has the 23 edges of technical §3, and the proposal-version machine has 8 edges. When a task leaves
`awaiting_approval` or `approved`, its current proposal version follows:

- to `preparing`: the version becomes `superseded`;
- to `cancelled`: `cancelled`;
- to `expired`: `expired`;
- to `approved`: `approved`;
- to `executing`: `dispatched`.

An endpoint causes only the transitions in §6.1 and §6.2. A request whose own effect would need any
other transition fails with `invalid_state` and changes nothing. Nothing a client or the model sends
moves a task into `approved` except endpoint 13, or into `executing` at all.

### 6.1 Requested by the caller

| Endpoint | `Task` transition (trigger) |
|---|---|
| 1 | new task in `preparing` |
| 7 | `blocked` → `preparing` (`input_or_access_provided`); none in `preparing` |
| 9 | `awaiting_approval` → `preparing` (`edited_or_context_stale`); none in `preparing` or `blocked` |
| 10 (owner, in `awaiting_approval`) | `awaiting_approval` → `preparing` (`edited_or_context_stale`) |
| 11 | `preparing` → `awaiting_approval` (`proposal_validated`) or `preparing` → `blocked` (`needs_input_access_or_home_pc`) |
| 13 approve | `awaiting_approval` → `approved` (`approval_consumed`); on a `failed` recheck `awaiting_approval` → `preparing` (`edited_or_context_stale`), `awaiting_approval` → `cancelled` (`rejected_cancelled_or_revoked`) or `awaiting_approval` → `expired` (`review_deadline_passed`) |
| 13 reject | `awaiting_approval` → `cancelled` (`rejected_cancelled_or_revoked`) |
| 14 | `preparing` or `blocked` → `cancelled` (`user_cancelled`); `awaiting_approval` → `cancelled` (`rejected_cancelled_or_revoked`); `approved` → `cancelled` (`cancelled_or_revoked_before_dispatch_claim`) |
| 15 | `awaiting_approval` → `preparing` (`edited_or_context_stale`), then as 11; or a new task in `preparing`, then as 11 |
| 16 | `outcome_unknown` → `succeeded` (`confirmed_by_reconciliation`), → `failed` (`confirmed_not_performed`) or → `unresolved` (`reconciliation_exhausted`); `unresolved` → `succeeded` (`verified_acceptance_evidence`) or → `failed` (`verified_non_execution_evidence`) |

### 6.2 Side effects of access, policy and device changes (technical §2)

These apply to every task of the owner that is affected when endpoints 22, 25, 26 or 31 are accepted.

| Cause | `Task` in `awaiting_approval` | `Task` in `approved` (before the dispatch claim) |
|---|---|---|
| A permission the proposal needs is removed: a grant revoked, paused, `expired` or narrowed out of scope, replies turned off, the connection disconnected, or execution-storage consent declined (22, 25, 26) | → `cancelled` (`rejected_cancelled_or_revoked`) | → `cancelled` (`cancelled_or_revoked_before_dispatch_claim`); the command is retired |
| A grant the proposal is bound to gets a new version but no needed permission is lost, for example widening (25) | → `preparing` (`edited_or_context_stale`) | → `preparing` (`policy_or_precondition_changed`); the command is retired |
| The device that `approved` it is removed (31) | none; that device's challenges are retired | → `cancelled` (`cancelled_or_revoked_before_dispatch_claim`); the command is retired |

- Tasks in `preparing` or `blocked` do not change state. Their in-flight reads and model responses are
  fenced, and their next preparation step may block them (`needs_input_access_or_home_pc`).
- Tasks past the dispatch claim do not change state and may still complete.
- A widened, resumed or reconnected grant never moves a `blocked` task; the owner continues with
  endpoint 7.

All other transitions are internal to the coordinator, executor and reconciler:

- `preparing` → `succeeded` and `preparing` → `failed`;
- the review and dispatch deadlines;
- `approved` → `preparing` when the dispatch-time recheck finds a change;
- the dispatch claim;
- execution outcomes;
- automatic reconciliation.

## 7. Dart client types (plan; CL-01 implements it)

1. **Source of truth.** The Zod schemas in packages/domain: domain objects and state enums (M0-04);
   request, response and view schemas and the endpoint registry (M0-04a).
2. **JSON Schema emit.** CL-01 adds packages/domain/scripts/emit-json-schema.ts, run as
   npm run schemas:emit -w @maya/domain.
   - It calls `z.toJSONSchema(schema, { target: "draft-2020-12" })`, with `io: "output"` for objects and
     responses and `io: "input"` for requests.
   - It writes one file per exported schema to
     packages/domain/generated/json-schema/<Name>.schema.json, with stable key order.
   - The files are committed.
3. **Dart generation.** CL-01 adds an in-repo Node generator that reads those files and writes Dart into
   the Flutter app's lib/src/api/generated/:
   - immutable classes with `fromJson` and `toJson`;
   - sealed class hierarchies for discriminated unions (kind);
   - Dart enums carrying the `snake_case` wire values;
   - extension types over String for branded IDs;
   - DateTime (UTC) for date-time, serialized with exactly three fractional digits and Z;
   - int, bool, String, List<T>, and nullable types for `null`.

   `fromJson` enforces required keys, types, enum values and unknown-key rejection. String patterns and
   length limits stay enforced by the coordinator.

   A third-party generator is not used. quicktype maps discriminated unions and branded IDs poorly, and
   openapi-generator needs Java plus a transport-level OpenAPI description, which this contract
   deliberately does not have. The schema subset is small.
4. **Checks.** A registered drift check regenerates the JSON Schema and Dart files and fails on any
   difference. A round-trip test feeds the TypeScript test fixtures through Dart `fromJson` and `toJson`
   and compares the JSON.
5. **Constraint from M0-04 on.** Domain schemas use only features that export to JSON Schema:
   - strict objects;
   - enums and literals;
   - discriminated unions;
   - arrays with length bounds;
   - nullable;
   - strings with a pattern, length or format;
   - bounded integers;
   - booleans;
   - defaults.

   Transforms, pipes, Date, bigint, Map, Set, tuples, and refine-only rules are not used for anything
   clients must know. The packages/domain tests convert every object schema with unrepresentable: "throw".

## 8. Not in this contract yet

Clients and the model cannot perform these until the named task adds them here through §9.

| Capability | Blueprint | Added by |
|---|---|---|
| **Forget this**: erase a task's or conversation's transcripts, cached content, derivatives and synced copies, keeping disclosed minimal execution evidence | product §7; technical §7 | FD-13b |
| Encrypted backup, restore and the recovery secret | product §7; technical §5 | BT-02 |
| Push-notification registration (opaque routing data only) | technical §5 | FD-18 |
| Voice audio streaming to the coordinator; final transcripts already arrive as text through endpoints 1 and 7 | technical §5 | CL-07 |
| A separately confirmed retention choice for one memory note | product §7 | FD-14 |
| Owner bootstrap (first-run step 1), a local Home PC action | technical §5 | FD-04, CL-10 |

## 9. Changing this contract

- Changes go through a Maya Build task. This document, the packages/domain schemas and the endpoint
  registry change in the same task.
- New fields are added as nullable.
- Removing or renaming a field or an enum value, or widening an allowlist, is a breaking change that
  needs its own plan review.
- Dart types are regenerated whenever the schemas change.
- No change may add an endpoint that dispatches or approves on behalf of the owner.
- No change may let planner reach decision, enrollment, grant, policy, connection, task input,
  processing, context removal, memory, cancellation, review-again or status-check operations.
