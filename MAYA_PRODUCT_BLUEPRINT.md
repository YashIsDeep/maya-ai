# Maya — product blueprint

Reviewed draft for product decisions • 25 September 2026 • Companion: [technical blueprint](MAYA_TECHNICAL_BLUEPRINT.md)

**Motto: simplicity and ease of use.** Maya should feel like one assistant available everywhere, not several apps. Its central contract is: **you choose what Maya may read; Maya prepares changes for your review; a trusted executor performs only the exact change you approve.** The user should see simple choices, plain words, and one clear button. This document covers what Maya is, what users see and decide, and what ships when. How the contract is enforced (permission checks, approval binding, execution, and failure handling) is in the [technical blueprint](MAYA_TECHNICAL_BLUEPRINT.md).

## 1. Product definition

**One-liner.** Maya is a personal assistant you own. It works across your phone and computer, reads only what you allow, and shows every external change for approval before acting. Internal storage and direct user edits follow the disclosed rules in [Section 7](#7-data-privacy-and-hosting).

**Who it is for (working assumption).** People who:

- use a phone and a computer, often from different ecosystems, and want one assistant across both;
- want help with email and scheduling but will not give an AI unchecked access to their accounts;
- prefer their assistant, account access, and history to live on their own computer.

**Why Maya (unique selling proposition).**

| Maya promise | What the user experiences | Why it is different |
|---|---|---|
| **Works across your devices** | Start on the phone, finish on the PC. The same conversation, draft, and approval appear on both. | Not tied to one phone or computer ecosystem. |
| **You approve exactly what happens** | Every send or change shows the real recipients and content, with one specific button such as **Approve and send**. What you approved is exactly what runs. | Approval is enforced by code and bound to that exact version, not a model asking "shall I continue?" |
| **Yours, on your hardware** | Your Home PC holds integration credentials and authoritative state; enrolled devices receive allowed views. Maya shows where AI processing happens. | Maya's relay cannot read content or tokens. Selected cloud AI receives only permitted task context under its disclosed retention terms. |
| **Always honest** | "Done," "Needs your OK," "Checking," "Didn't happen," or "Couldn't confirm," according to the available evidence. Activity shows what Maya read as well as what it did. | A trail you can check, including reads. |

The first two promises are what people should notice every day. The last two are intended to earn their trust. The positioning hypothesis is the combination: cross-device, user-owned, and exact approval that stays simple. Validate it through user research and comparison with current competitors before making exclusivity or ease-of-use claims.

**Design principles.** Judge every feature and screen against these principles, in this order:

1. **Strict underneath, simple on top.** Permission checks, approval binding, and failure handling stay rigorous. Users see a short summary, plain words, and good defaults. Details are one tap away: never hidden when they matter, never required when they don't.
2. **Defaults that work.** A new user reaches a useful answer without opening Settings. Provide useful defaults, but require an explicit choice before enabling account access, cloud processing, or optional storage; a suggested preset is not consent.
3. **One obvious next step.** Each screen has one primary action. An approval card has three decision controls: **Edit**, **Cancel**, and a specific action such as **Approve and send**. Accessible detail expanders and source links remain available.
4. **Same words everywhere.** Phone, PC, and voice use the vocabulary below. Internal terms never appear in the UI.
5. **Ask when it matters.** Request access, microphone, and notifications at the point of use, not during setup.
6. **Complexity budget.** A new setting, screen, or prompt must replace something or answer a demonstrated user need. First ask: "Could this be a default instead?"

**Plain-language vocabulary.** The internal terms on the left are used in the technical blueprint.

| Internal term | What users see |
|---|---|
| Coordinator | **Home PC** ("Maya on your PC") |
| Grant, scope | **Access** ("Maya can read: email from the last 30 days") |
| Proposal awaiting approval | **Needs your OK** |
| Approval | An action-named button: **Approve and send**, **Approve and add** |
| Receipt, Succeeded | **Done**, with what happened and when |
| OutcomeUnknown | **Checking…**, then **Done**, **Didn't happen**, or **Couldn't confirm** |
| Unresolved | **Couldn't confirm**, with the provider link and a warning before any resend |
| Failed | **Didn't happen**, with the reason and a next step |
| Blocked | **Waiting for…** what is needed: your answer, access, or a step on your Home PC |
| Cancellation not yet acknowledged | **Cancellation pending** |
| Expired | **Review expired**, with a one-tap **Review again** |
| Cancelled | **Cancelled** |
| Revocation | **Turn off access** |
| Activity log | **Activity** |

**Memory, kept simple.** Maya remembers what you explicitly ask it to ("Remember that Priya prefers mornings"). Remembered items appear in one list you can edit or delete. A direct instruction is approval for that exact internal change; Maya echoes the saved text with an undo control. Quoted or retrieved instructions cannot authorize memory writes. If resolving "remember this" requires interpretation, show the proposed note before saving. Source-derived notes retain their access and destination restrictions. Maya does not build inferred memories in 1.0.

**What Maya is not, in 1.0.** Not an autonomous agent that acts on its own, not always listening, not a replacement for your email app, not a smart-home, payments, or purchasing controller, and not a plugin platform.

## 2. Requirements, assumptions, and decisions

| Status | Item |
|---|---|
| Confirmed requirement | Personal assistant available on a phone and PC, with future interfaces supported. |
| Confirmed requirement | Voice and visual interaction, easy activation, connected apps/services/devices, and context-assisted task completion. |
| Confirmed requirement | Reads require a user-granted scope. Connecting an account does not imply unrestricted access. |
| Confirmed requirement | Actions that change something require explicit approval. |
| Confirmed requirement | iPhone, Android, macOS, Windows, and Linux are target platforms. |
| Confirmed requirement | Local-first operation, with selected cloud AI services. |
| Confirmed requirement | Simplicity and ease of use are the governing product principle. |
| Proposed interpretation, to confirm | "Strict underneath, simple on top": simplicity changes what users see and decide, never whether a permission or approval check runs. |
| Proposed sequencing, to confirm | Private beta on one phone OS and one desktop OS; public 1.0 on all five platforms after the same contract tests pass. |
| Working assumption | One owner; no household or organizational delegation in the MVP. |
| Working assumption | One user-selected desktop or always-on home computer, the Home PC, coordinates tasks and holds integration credentials. Other devices connect securely; a built-in relay carries encrypted traffic so remote access needs no network setup. |
| Recommendation, not yet confirmed | Google first: Gmail read and reply, plus read-only Google Calendar. English, text, and push-to-talk initially. |
| Proposed interpretation, to confirm | Per-action approval covers external changes, communications, model-proposed memory, and permission changes. Optional conversation history is separate from the encrypted execution records required for safe writes. Without execution-record consent, only temporary read/chat work is available. |

The final interpretation matters: persisting a task or synchronizing a draft technically changes stored data. Maya should explain these routine internal operations during setup. It should never silently reinterpret the approval principle to permit external actions. A direct user edit or explicit settings change can itself be approval for that exact internal change; model-inferred changes cannot.

## 3. One product, several interfaces

A conversation, its tasks, and anything waiting for approval are the same shared objects on every device. Switching devices changes the view, not the identity of the work.

| Surface | Recommended behavior |
|---|---|
| Windows, macOS, Linux | Configurable shortcut and tray/menu-bar entry where supported open a small text/microphone panel. Expand into a workspace with conversation navigation, task cards, a source pane, and full approval details. Keep an ordinary app entry point for environments with shortcut/tray restrictions. |
| iPhone and Android | Tap-to-talk or text entry; optional widgets/system shortcuts. Use the share sheet to pass selected text or a link deliberately. Provide full review and approval within the unlocked app. Native entry points vary by OS. |
| Voice | Visible listening state, live transcript, brief spoken responses, interruption, mute, and a persistent stop control. Any voice request can become a visual task card. |
| Future watch, speaker, car, or browser | Declare whether the interface can display, capture, authenticate, and approve. Interfaces lacking trustworthy review or authentication hand approval to a capable device. |

Use three navigation destinations: **Chat, Approvals, Settings**.

- **Chat.** Conversations, with tasks shown as live cards where they started. An "Active" strip at the top lists work in progress on any device.
- **Approvals.** Everything that needs your OK, with a badge count. The list is empty most of the time.
- **Settings.** Access (connected services), Activity, Devices, Memory, and Privacy.

The desktop shows the conversation and approval details side by side. The phone uses focused screens with the same content and vocabulary. A separate Tasks screen is deferred until users have enough parallel work to need it.

**First run: three steps.** The usability target is five minutes from starting the install to sending a first approved reply, including connecting Google ([acceptance scenario 13](MAYA_TECHNICAL_BLUEPRINT.md#8-acceptance-scenarios-and-performance-goals)).

1. **Install Maya on your PC.** It becomes your Home PC and creates a local owner identity. No hosted Maya account is needed.
2. **Install Maya on your phone and scan the PC's QR code.** Confirm that the same short code appears on both screens. Pairing can be skipped for desktop-only use and completed later; the five-minute cross-device target includes both installations.
3. **Choose how Maya thinks.** *Cloud AI* names the provider, permitted data categories, retention, and cost before enabling it. *On this PC only* is offered after a hardware and model-readiness check. An unavailable route stays unavailable; it does not silently select the other route. This step also says that conversation history is optional and off by default, and that sending requires a few encrypted execution records; consent to those records is asked when you turn on replies ([Section 7](#7-data-privacy-and-hosting)). You can change these choices at any time.

Encrypted backup, with its recovery secret, is offered after first run from Settings rather than added as a fourth step.

For the feasibility spike, cloud access uses the owner's provider key stored on the Home PC. Public distribution still needs a supported credential/billing flow and model-download experience before the five-minute target is credible. Measure the complete setup, including authorization, downloads, and billing/key setup; record those contributions separately. Do not embed a shared vendor API secret in desktop or mobile packages. The release decision is listed in [Section 9](#9-open-decisions).

Maya then suggests a first try: "Ask me anything, or connect Google so I can help with email and your calendar." Connecting Google is one screen with two clear choices (see [Section 4](#4-access-what-maya-can-read-and-change)) and a **Customize** link. Microphone, notifications, files, and other access are requested separately when first needed. Screen capture and clipboard access are not part of 1.0.

**Approving from the phone.** The notification says "Maya needs your OK," with no sender, subject, or message content. Tap it, unlock the app with Face ID, fingerprint, or passcode, read the card, and tap **Approve and send**. The same card appears on the PC. A notification cannot submit approval itself.

Context should arrive through deliberate affordances such as “Use this text” or “Share with Maya.” In 1.0, the share sheet accepts selected text and URLs as text; a shared URL does not authorize fetching a page or following links. Web retrieval and “Read this folder” are later connector capabilities. Show context chips with source, account, capture time, and a remove control. Avoid ambient clipboard polling, whole-screen recording, or broad filesystem crawling in the MVP.

Task cards display actual workflow states in the shared vocabulary: **Finding messages**, **Preparing reply**, **Needs your OK**, **Sending**, **Done**, **Waiting for…**, **Didn't happen**, or **Checking…**. Show what is known and what needs input; do not invent completion percentages. “Cancel” stops work that has not been dispatched once the Home PC acknowledges it. A cancellation requested while disconnected is **Cancellation pending**; it cannot promise to stop an action already accepted by the Home PC. For an in-flight action, acknowledge the cancellation request and report the eventual outcome.

Handoff example: dictate a request on the phone, refine the draft on the PC, and approve on either enrolled device. Sync text and task state; do not silently activate another device's microphone or transfer a live recording. Hide message contents in lock-screen notifications by default. All controls must work with keyboard navigation and screen readers; state must not depend on color alone.

If two devices edit the same draft, keep both versions and ask the owner which to use; never silently overwrite either edit. Reconnecting applies access changes and deletions before offering an offline edit for recovery. Removed or expired source content cannot return through an old draft.

Show connection status and processing location together, for example "Home PC connected · Using [cloud AI]" or "Home PC connected · On your PC." When contact is lost, say "Can't reach your Home PC" unless its cause is known; a network or relay outage does not prove that the PC is off. Clients can use allowed cached views and edit local drafts, but cannot authorize new remote executions. Say: "You can keep writing. Reconnect to review and send." Never show a spinner that waits indefinitely. Previously acknowledged work may still finish on the Home PC; reconnecting retrieves its status before offering another send. This availability limit is the largest ease-of-use cost of local-first design; see [Section 9](#9-open-decisions). An always-on home machine improves availability without relocating authority to the cloud. Explain and obtain consent before enabling Maya's background service: closing the window can leave it running, while sleep or shutdown stops availability. A phone should not be assumed to be a reliable continuous background coordinator.

**Devices and recovery.** Settings → Devices lists enrolled phones and computers, their last contact, and **Remove device**. Adding a computer joins the existing Home PC rather than creating another one; provide an accessible pairing alternative when scanning a QR code is unavailable. Removing a device blocks its new access and approvals when the Home PC acknowledges the change. Remote removal cannot immediately erase an offline cache; its existing access lease still bounds use. If the Home PC is lost, guide the owner through restoring an encrypted backup with its recovery secret, reconnecting services, and pairing devices again. If the old PC cannot be safely retired, revoke or rotate its provider and cloud credentials before activating a replacement. A paired phone is not a backup or an automatic replacement Home PC; without a usable backup and secret, explain which Maya data cannot be recovered. Provider-owned mail and calendar data remain with their providers.

Start with push-to-talk. Do not promise a universal custom wake word; platform constraints on background listening are covered in the [technical blueprint](MAYA_TECHNICAL_BLUEPRINT.md#5-backend-architecture).

## 4. Access: what Maya can read and change

Default is disconnected. After the user connects and scopes a source, Maya can read within that grant without asking again. Write capabilities are off until the user picks a preset that includes one; the proposed email default does, and the connection screen names send access before the user confirms. Turning one on makes it available for proposals; every execution still needs approval. There is no "always allow writes" setting in this design.

**Presets, not layers.** Maya enforces access through several layers ([technical blueprint](MAYA_TECHNICAL_BLUEPRINT.md#2-permission-enforcement)). Users should rarely see them as separate controls. Connecting a service asks at most two plain questions, each with a preset:

| Question | Presets (default first) | Customize (one tap away) |
|---|---|---|
| What can Maya read? | Email: **Last 30 days, no attachments**. Calendar: **When I'm free** (availability on the primary calendar) or **Event details**. Either service can be left off. | Date range, labels, fields, expiry; attachments remain unavailable in 1.0 |
| Can Maya send or change things? | Email: **Read, and reply when I approve** or **Read only**. Calendar: read only in 1.0. | Individual write capabilities |

The presets set no access expiry; expiry is a **Customize** option.

Proposed default: **Read, and reply when I approve.** Most people connect email to get help replying. This choice avoids another Google authorization in the middle of a task, possibly on the wrong device. The tradeoff is that the stored Google token can send earlier. It stays inside the Home PC's credential boundary, and every send still requires approval. The connection confirmation explicitly names send access. Users who choose **Read only** can turn on replies later from the Home PC. Confirm this default ([Section 9](#9-open-decisions)).

Google grants Maya mailbox-wide read access; the 30-day and no-attachment limits are Maya's own, applied before content reaches the AI or any cache. Explain this distinction in the connection **Details**. Where a user needs provider-level isolation, suggest a separate mailbox.

Cloud processing is covered by the "How Maya thinks" choice made during setup, which names the provider and each permitted category: task text (including locally transcribed speech), selected email text and addresses, calendar availability, and any explicitly included memory. Event details require a separate category choice. Raw audio and attachments stay on devices in 1.0. An enabled provider is not permission to upload every connected source: content keeps the limits of the sources it came from, so an email-only choice cannot send calendar results or unrelated conversation history.

Offer a per-task “Keep on my devices” setting. If local capacity is insufficient, explain the limitation and request a scoped cloud-processing grant; never silently fall back to cloud AI.

**Meaning of local processing.** “Keep on my devices” prevents subsequent task content from reaching cloud AI and content-bearing telemetry. It still permits the connected provider requests and encrypted device relay needed for the task; explain this beside the control. Content already uploaded cannot be recalled; show that fact and the prior destination.

**Connection UI.** The summary line reads like a sentence: "Maya can read your last 30 days of Gmail and see when you're free. It can reply only when you approve. Used 2 hours ago." **Details** shows the account identity, Maya restrictions, provider scope, processing destinations, retention, background monitoring status, last use, and expiry. Offer **Pause**, **Change access**, **Turn off replies**, and **Disconnect**. Disconnecting asks one follow-up question: "Also delete what Maya saved from this account?"

Keep the summary accurate for the scopes actually granted, including partial Google consent. If sign-in expires, show **Reconnect Google** and preserve any still-eligible draft until its retention deadline; sending remains unavailable until access is restored and the owner completes a fresh review. Explain when this step needs the Home PC. Background monitoring is **Off — unavailable in 1.0**, not a working toggle.

**Turning access off.** **Pause** suspends use; **Turn off replies** denies sends locally; neither promises to narrow an already-issued Google token. **Disconnect** also removes local credentials and attempts provider revocation, reporting any outstanding provider step. A combined Google authorization may cover Gmail and Calendar, so show the affected services before revoking it. Show revocation requested from a disconnected client as pending until acknowledged. A disconnected account does not automatically erase copies already stored; present that choice, while denying their retrieval immediately. A send already past the point of no return may still complete, and an offline device may retain its cache until it reconnects or its cache expires. State these limits accurately.

Resuming access or reconnecting an account never restores an old approval or automatically sends a saved draft. Revalidate retained content and prepare a fresh review when the owner continues.

**Activity.** Show reads as well as writes: resource/account references, purpose, time, task, grant used, processing destination, and result. Write records also identify the reviewed version, approval identity/device, execution attempts, and provider receipt. Record denials and scope changes. Activity follows the retention rules in [Section 7](#7-data-privacy-and-hosting): it does not keep subjects, message bodies, or full previews after their content deadline. When content is gone, show **Reviewed content no longer stored** beside the remaining outcome evidence. A retained version reference or digest is not a readable copy of the approved message.

## 5. Approvals

**What every approval shows.** Every approval displays the service/account, action, targets, full changed content or diff, recipients/audience, attachments, timing and timezone, expected effects, material limitations, and expiry. Lists and long content can expand, but must be reviewable without hidden recipients or omitted effects. An email preview includes the actual sending address, To/Cc/Bcc, subject, body including signature/quoted content, and attachments. Resolve display names to addresses. Flag Reply-To differences.

The card is built from the exact payload Maya will send. A model-written summary can explain the action but cannot replace its concrete details. Use an action-specific button such as **Approve and send**, not a generic “Continue.”

**Reply recipients.** Resolve recipients from the selected message's address headers, never from instructions inside its body. A plain "reply" defaults to its valid Reply-To address(es), or From if Reply-To is absent, with no automatic Cc/Bcc. Show a Reply-To mismatch prominently. Do not infer reply-all or add recipients without the owner's explicit choice; ask when the intended audience is ambiguous. Any recipient edit creates a new review, and recipient groups must remain fully inspectable.

**Edits and changes.** A material edit, or a detected material change in the thread or calendar before sending, produces a new review that needs a new approval. The final check must succeed using current access; otherwise sending waits for the problem to be resolved and a fresh review. Calendar availability is a point-in-time check, not a reservation. Show the checked interval, timezone, calendar, and check time with a scheduling reply, and explain that messages or availability can still change between the final check and sending.

**Expiry.** Proposed default: a review expires 10 minutes after Maya prepares it. An approved send must start before that deadline and within 60 seconds of approval, whichever is sooner; otherwise it requires a fresh review. Earlier loss of access or content also invalidates the review. **Review again** revalidates access and context and shows a new card; it never approves or sends by itself. An already-started send may finish after the deadline, so elapsed time alone cannot mean **Didn't happen**. These values need usability testing and can differ by operation. Scheduled sends are deferred.

**Connection lost after approval.** If the owner taps **Approve and send** but loses the acknowledgement, show **Checking whether your approval reached your Home PC** and retrieve the same task's status after reconnecting. Do not offer a replacement send as though nothing happened. Duplicate approval taps refer to the same reviewed version and cannot create another command.

**Voice.** MVP voice can prepare and edit, but the final approval requires review on an unlocked enrolled device. A recording of “yes” or a familiar voice is insufficient authentication. Later voice approvals would need trusted user presence, exact action binding, and an accessible complete readback.

**When Maya can't tell what happened.** Maya shows **Checking…** during bounded status checks (proposed default: up to five minutes while access permits). If it still cannot determine whether Gmail sent a reply, the user sees "Couldn't confirm whether this was sent. Check Gmail before trying again," with a link. Maya never resends automatically after an ambiguous result. **Check again** only checks status; any resend is a new review that warns about a possible duplicate. To check, the reply preset discloses one extra read purpose, “Check the status of replies Maya sends,” limited to the replies Maya itself sends. Missing access or expired evidence leaves **Couldn't confirm**, never an invented success or failure.

**One change per task.** In 1.0, each task makes at most one external change. Later multi-step tasks approve a fully listed batch or each new change separately; Maya never asks for blanket approval of unknown future steps. Report partial success precisely, and do not promise universal undo.

## 6. Worked example: read an email, draft a reply, send it

All names and addresses below are illustrative.

1. On the Home PC, the owner connects Google and keeps the defaults: **Last 30 days, no attachments**, **When I'm free** on the primary calendar, and **Read, and reply when I approve**, including the disclosed reply-status checks. The "How Maya thinks" choice states whether task text, email, and availability may go to the selected cloud AI. Credentials remain on the Home PC. No email is sent without approval.
2. On the phone, the owner says: "Read Priya's latest email about the launch and draft a reply saying Tuesday works." Maya transcribes the request and resolves which Priya and which thread are meant. It asks only if the request is materially ambiguous.
3. The Home PC's read broker fetches permitted messages directly from Gmail. In this example Priya's message specifies Tuesday, 29 September 2026, 15:00–15:30 in Asia/Kolkata (UTC+05:30). Maya checks that complete interval and shows the source, calendar, and check time: "No busy time on your primary calendar for that half hour. Other calendars weren't checked." Missing timezone/duration, partial results, or a provider error produce uncertainty or a clarification, never a claim of availability. Conflicts are shown before drafting. Only permitted context reaches cloud AI. Reading does not archive, relabel, mark as read, or load tracking images.
4. Maya prepares the reply text inside its task workspace. This is not a Gmail draft. Saving to Gmail would be a separate write, and Gmail drafts are not part of 1.0. Maya displays the resolved date, interval, and timezone so the owner can correct them before making a commitment.
5. The owner opens the same task on the PC and edits it. Replies are already enabled by the connection preset. Had the owner chosen **Read only**, Maya would say "Turn on replies to send this" and run the Google authorization on the Home PC; on the phone, the task would show "Finish this on your PC." Returning from Google sign-in only allows Maya to prepare a send approval; it does not approve the send.
6. Maya freezes the proposal and shows this review:

```text
Send 1 email now through Gmail
From: owner@example.com
To: Priya Rao <priya@example.org>
Cc: none       Bcc: none
Subject: Re: Launch review
Reply in: Launch review
Attachments: none

Hi Priya,
Tuesday, 29 September 2026, 15:00–15:30 Asia/Kolkata
(UTC+05:30) works for me for the launch review.
Thanks!

This sends this reply and stores Gmail's normal Sent copy.
It does not create a calendar event.
Calendar checked: primary calendar, 25 Sep 2026 at 14:30 Asia/Kolkata.
No busy time found for 29 Sep, 15:00–15:30 Asia/Kolkata.
Availability can change; this does not reserve the time.
Once sent, it can't be unsent. This review expires in 10 minutes.
After approval, sending must start within 60 seconds and before expiry.

[Edit]   [Cancel]   [Approve and send]
```

7. The owner selects Approve and send on the unlocked phone or PC. The authenticated approval reaches the local coordinator, which verifies the proposal version and current rights, checks for relevant new messages and changed availability, and records the approved command. Before sending, it checks access, context, and the dispatch deadline again. If anything material changed, it returns a new review instead. If the coordinator cannot be reached before submission, the app asks the owner to review again when it reconnects; it does not queue an offline approval. If contact is lost after submission, the app checks whether that approval was accepted before offering a new review.
8. The executor sends the frozen message and stores the provider result. Both devices show "Done: reply sent to Priya at 14:32" with a message link and an activity record. **Details** explains that Gmail accepted the message, which does not prove delivery or that it was read. On an ambiguous failure, both devices show "Checking whether Gmail sent this… I won't resend automatically."

The Google scopes, authorization flow, and send details behind this workflow are in the [technical blueprint](MAYA_TECHNICAL_BLUEPRINT.md#4-google-integration).

## 7. Data, privacy, and hosting

**Separate optional history from necessary execution records.** Choosing replies includes a plain explanation and consent to encrypted records needed to send once and recover safely. Disabling conversation history does not disable those records. If the owner declines execution storage, Maya can perform temporary reads/chat and prepare ephemeral drafts, but must keep external writes disabled. Explicitly saved memory is a separate choice. Autosave and device sync follow this storage policy rather than requesting approval for every keystroke.

History off means completed conversations are not kept; it does not mean active work never touches disk. Disclose encrypted temporary task storage and device sync before use, with the ceilings below. Without execution-storage consent, task content stays in memory, any live handoff is temporary, and closing or restarting Maya loses it. Minimal access/security Activity remains separate from conversation content and is disclosed when enabling the relevant access. Saved settings, grants, device identities, and explicitly requested memory have their own stated lifetimes.

| Data | Proposed 1.0 retention and behavior |
|---|---|
| Raw audio | Memory buffers only; discard after transcription/cancellation, never include in backups or diagnostics |
| Source cache and source-derived text | Active task only, at most 24 hours from capture, bounded by grant/resource eligibility and provider restrictions; reading does not reset expiry |
| Draft/proposal/command payload | Encrypted while needed, at most 24 hours from creation and subject to stricter source limits; purge on completion when history is off. Expiry before dispatch cancels the command; expiry after dispatch leaves outcome metadata for checking |
| Conversation history | Off by default; user-authored text may be retained for 30 days if enabled. Quotes, transcripts containing source data, summaries, and generated replies inherit source limits and are redacted/removed when those expire |
| Explicit memory | User-authored notes remain until deleted; source-derived notes obey source grants and applicable retention rules. A separate retention choice may preserve a specific note only if source/provider rules permit it |
| Activity and execution evidence | Minimal metadata, payload digests, dispatch markers, and receipts for 90 days from the recorded event by default; no subjects, message bodies, or credentials. Read/access records exist even with history off; write evidence requires execution-storage consent. Payload expiry leaves only the allowed evidence, and an expired evidence window cannot re-enable a write |
| Device cache | Encrypted with the same content deadlines and an offline access lease no longer than 24 hours or the grant's remaining lifetime, whichever is shorter |
| Settings, access grants, device identities, and credentials | Keep while enabled or enrolled; disconnect/removal deletes active credentials or keys as applicable and retains only the minimal revocation evidence needed to reject stale access. Audit copies follow the Activity deadline |

These are product ceilings, not permission to exceed a provider's cache headers or data-use restrictions. Cloud processors have separate terms that the connection UI must disclose; local deletion cannot erase their existing copies. “Forget this” covers transcripts, cached content, derivatives, and synced copies. It can erase content immediately while leaving disclosed minimal execution evidence so a lost receipt cannot cause a resend. Show that distinction before the deletion choice.

Maya-managed backups are encrypted and expire after a proposed 30 days; user-exported backups are outside automatic erasure. In 1.0, backups exclude raw audio, source caches, transient drafts/proposals/command payloads, and provider/cloud credentials. Restoring preserves original retention deadlines, reapplies known deletions, invalidates old approvals and sessions, and requires fresh service access; it never resends pending work. Explain that deletions newer than an exported backup may not be known at restore; never promise instant erasure from such backups or downstream processors. The recovery flow is described in [Section 3](#3-one-product-several-interfaces).

| Choice | Benefit | Cost / constraint | Recommendation |
|---|---|---|---|
| Local-first + selected cloud AI | Local authority, credentials, history, and execution; optional stronger AI | Coordinator availability, relay/sync work, explicit data egress | Confirmed direction; MVP architecture |
| Fully local AI | No content sent to AI processors | Hardware, mobile battery, model capability and availability constraints | Optional per-task route when hardware supports it |
| Cloud-hosted coordinator | Continues while all user computers are off | Moves authority and state off the user's devices | Outside the selected design; requires a separate future decision |
| API integration | Structured scopes, stable identifiers, auditable outcomes | Provider coverage and approval processes | First choice |
| UI automation | Reaches apps without APIs | Fragile state, broad permissions, uncertain effects | Defer and isolate by capability |

Use encrypted device transport, local encrypted storage, and minimized provider requests. Device sync can be end-to-end encrypted through a relay; content explicitly sent to a cloud model is necessarily visible to that processor. Do not conflate those guarantees. Cloud requests, crash reports, and telemetry should exclude credentials and unneeded personal content. The local coordinator still depends on the user's OS security; a compromised owner session is outside the protection supplied by approval UI alone.

## 8. MVP, roadmap, and release gates

The MVP workflow is: **"Ask on your phone, check your calendar, review a reply, and approve it on either device, with a clear status throughout."** Completing it in under a minute is a usability target for an already configured, connected system, not a guarantee. **Couldn't confirm** is a valid, visible outcome when evidence is missing.

This single workflow exercises all four promises from [Section 1](#1-product-definition): cross-device, exact approval, local ownership, and honest results. Beta research must establish whether that combination is valuable enough for the intended users.

**MVP scope.**

| In 1.0 | Deliberately out of 1.0 |
|---|---|
| One Home PC and paired phones and computers, with QR pairing and a built-in encrypted relay | Automatic failover, multiple Home PCs, hosted coordinator |
| Text chat plus push-to-talk voice with short spoken replies | Wake word, always-listening mode, voice-only approval |
| One Google account: Gmail read (last 30 days by default) and plain-text replies from its primary address after approval | Attachments, Gmail drafts, labels or archive, sender aliases, multiple accounts, other email providers |
| Google Calendar read only: primary-calendar availability by default, event details optional | Other calendars, creating or changing events (the first 1.1 write candidate) |
| Explicit "Remember that…" memory with a visible, editable list | Inferred memory, broad inbox indexing, semantic search across all mail |
| Approvals inbox, Activity, Access controls, cancel, and honest unknown outcomes | Proactive suggestions, background monitoring, scheduled sends |
| One cloud AI route, or on-PC processing where hardware allows | Choosing among several AI providers, per-source routing UI |
| Share sheet for selected text/URLs as text on phone; shortcut and tray where supported on desktop | Web fetching, screen reading, clipboard monitoring, browser control, shell or file writes |

Revocation, activity review, cancellation, and uncertain-outcome handling are part of the core product and ship before any beta.

Release gates refer to the numbered [acceptance scenarios](MAYA_TECHNICAL_BLUEPRINT.md#8-acceptance-scenarios-and-performance-goals) in the technical blueprint.

| Stage | Deliverable | Exit evidence |
|---|---|---|
| Feasibility spike | Google verification, scope/reauthorization and token-lifetime path; cloud processor/cost/retention fit; exact Gmail read/send/reconciliation behavior; QR pairing, relay, native activation/audio/storage on two beta platforms; smoke tests on the other three | Real-device/account evidence, restrictions and isolation design documented; cloud credential/billing and model-download paths costed |
| Foundation | Owner identity, device enrollment, task store, scoped read broker, Access UI with presets, Activity | Out-of-scope reads denied; revocation blocks new access |
| Safe vertical slice | Gmail read + calendar availability → Maya draft → immutable send proposal → approval → receipt | Edited/stale/expired approvals fail; injected crashes before and after dispatch cannot duplicate a send; policy/retention races pass |
| Private beta (2 platforms) | One phone OS + one desktop OS: text, push-to-talk, playback, handoff, reconnect, approval notifications | Applicable correctness scenarios 1–12 and 15–27 pass on both beta platforms; usability scenarios 13, 14, and 28 measured, with platform exclusions recorded; same reviewed version on both clients; Google test-user constraints and relay operations documented |
| Public 1.0 (5 platforms) | Remaining clients pass the same contract and simplicity tests | Correctness scenarios 1–12 and 15–27 pass across the supported compatibility matrix; approval-comprehension gate 14 met; timing targets 13 and 28 measured, with a documented release decision for any unmet target and no unvalidated timing claims; required provider verification/assessment and supported cloud onboarding complete |
| 1.1 and later | Calendar event creation with approval, selected files, deeper OS entry points; then browser share, watch or speaker handoff, optional local wake word | Each addition passes the same permission, execution, and complexity-budget review |

All five platforms remain the 1.0 product target. The private beta uses two platforms to learn quickly, not to drop OS support. Plan macOS and iOS build and signing access, and separate Windows and Linux packaging and test coverage. Minimum OS versions, CPU architectures, and Linux distributions remain explicit release decisions.

Future monitoring requires a separate read grant and notification preference. Future automations can prepare changes but still request approval for every write under the confirmed principle. Choose later connectors based on actual use, and add selected-file retrieval before any broader filesystem integration.

**Simplicity targets**, to validate in the private beta: setup completion rate, time to first useful answer, time from request to provider-confirmed send (goal: under one minute for the configured MVP workflow, including the user's review), and the number of prompts or questions per task. Report median, 90th percentile, completion rate, and unknown outcomes with sample sizes; keep onboarding time separate and include it in the five-minute setup target. Treat Settings visits as diagnostic information, not a target to suppress access or privacy controls. Approval comprehension and accessibility remain release criteria even when taking time to review lowers speed metrics.

Also track successful workflow completion, draft edit rate, handoff reliability, latency, cost per task, and unknown-outcome frequency. Treat unauthorized execution as a release-blocking defect rather than an acceptable percentage.

## 9. Open decisions

| Question | Working recommendation | Why it matters |
|---|---|---|
| What happens when the Home PC is asleep or off? | Accept for 1.0: phone shows permitted cached views and keeps drafts within the chosen storage mode, with a plain "Can't reach your Home PC" message. Encourage an always-on machine and measure how often users hit this in beta | The largest ease-of-use cost of local-first. If beta users hit it often, revisit an optional hosted coordinator as a separate decision |
| Who is the first target user? | People with devices from more than one ecosystem who want email and scheduling help without giving an AI unchecked access ([Section 1](#1-product-definition)) | Shapes positioning, platform order, and which connector comes next |
| Which phone OS and desktop OS for the private beta? | The two the team uses daily | Fastest learning loop; the other three follow in public 1.0 |
| Default Google preset: **Read only** or **Read, and reply when I approve**? | Read, and reply when I approve | Avoids a mid-task sign-in; the token can send earlier, although each send is still gated by approval |
| Which cloud AI service, and what data may it receive? | One provider for 1.0; email text allowed for drafting; audio and attachments stay local | Local-first is confirmed; the actual provider and data categories are not |
| How is cloud AI provisioned and paid for? | Owner-supplied key for the spike; choose a supported direct-provider credential/billing flow before public release | No hosted Maya account and a five-minute setup are not yet validated together; never ship a shared secret or assume free inference |
| Who operates the relay and notifications? | A minimal service with an accountable operator, metadata TTL, quotas, cost budget, and outage procedure; devices identify themselves with pairing keys, not a user sign-up; LAN-only remains available | Encrypted content still needs routing infrastructure, push credentials, abuse prevention, and sustainable operations. A relay account the user must create would break the no-account setup in [Section 3](#3-one-product-several-interfaces) |
| Which OS versions, hardware, and Linux distributions? | Define a five-platform compatibility matrix | All five OS families are confirmed; support boundaries remain open |
| Personal prototype or distributed product? | Distributed product, single owner per install | Google verification, security assessment, operational support, and identity design |
| First services? | Gmail and Google Calendar, one Google account | Connector scopes and release feasibility |
| What counts as a change inside Maya? | Optional history off by default; explicit consent for required execution records; memory only from direct owner instructions/edits in 1.0 | Keeps safe crash recovery available without treating optional history as mandatory |
| Are full visual approvals acceptable initially? | Yes, on an unlocked enrolled device | Defines achievable voice-only behavior |
| Languages, accessibility needs, and budget? | English plus text fallback; measure costs in the spike | Speech choices, UI priorities, and performance targets |

These product choices remain open; reviewing the blueprint does not turn recommendations into confirmed requirements. The feasibility spike may proceed with documented assumptions. Private beta requires the scope, processor, platform, and operating choices it depends on; public release additionally requires the listed verification, onboarding, and compatibility gates.
