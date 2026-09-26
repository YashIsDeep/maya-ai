# Spike: cloud AI processor

**Task:** SP-04 · **Date:** 26 September 2026 · **Status:** decided. The owner chose Anthropic (Claude API) ([DECISIONS.md](../DECISIONS.md), 2026-09-26).

This report compares the three cloud AI providers the owner shortlisted in M0-01 against Maya's data rules: product blueprint §4 and §7, and technical blueprint §2 (cloud processing) and §4 (Workspace user-data policy). It records the owner's choice, the conditions Maya must follow with that provider, and how the spike handles the provider key. Provider terms and prices change; every fact below was read on 26 September 2026 from the sources in §10.

## 1. Outcome

- **Provider:** Anthropic, through the Claude API's Messages API. It is the one cloud AI route for the spike and for 1.0, subject to the answer-quality check in §9.
- **Categories Maya may offer to send:** task text (including locally transcribed speech), selected email text and addresses, calendar availability, and explicitly included memory. Event details are a separate opt-in, off by default. Raw audio and attachments never leave the owner's devices.
- **Cost target:** at most US$0.05 per reference task (§5).
- **Spike models:** `claude-sonnet-5` is preferred, with `claude-haiku-4-5-20251001` as the fallback. [cloud-ai-measurements.md](cloud-ai-measurements.md) picks between them using the rule in §5.
- **Key:** the owner's own key, `MAYA_CLOUD_AI_API_KEY` in the gitignored `.env` on the Home PC for the spike; the OS vault in the product (§7, §8).

## 2. Candidates and method

The candidates are the M0-01 shortlist: Anthropic (Claude API), OpenAI API, and Google Gemini API (paid tier). Each is judged on:

1. training and retention terms for API data;
2. fit with Google's Workspace API user-data policy, which applies because Maya would send Gmail content (a restricted scope) to the processor;
3. cost per task, estimated from published prices and, for the chosen provider, measured.

Answer quality is not compared here (§9).

## 3. Training and retention terms

| | Anthropic (Claude API) | OpenAI API | Gemini API, paid tier |
|---|---|---|---|
| Trains on API data by default | No: "Anthropic may not train models on Customer Content from Services" (Commercial Terms) | No, since 1 March 2023, unless the customer opts in | No for Paid Services. **The unpaid (free) tier does train on prompts, and human reviewers may read them** |
| Default retention of prompts and responses | Deleted within 30 days of receipt or generation | Abuse-monitoring logs kept up to 30 days. The Responses API also keeps application state for at least 30 days unless `store: false` | Kept 55 days for abuse monitoring (Prohibited Use Policy) |
| Flagged or legally required retention | Flagged content up to 2 years (classifier scores up to 7 years); longer where the law requires | Longer where the law requires or where needed to protect services or third parties | Flagged content may be assessed by authorised Google staff; legal disclosures |
| Zero data retention | By arrangement through sales, per organization; not available for the "Covered Models" (Claude Fable 5/5.1, Mythos 5/5.1) | Zero Data Retention or Modified Abuse Monitoring by prior approval | None documented for the Gemini Developer API |
| Server-side state Maya must avoid | Files API, Batch API, code execution, Managed Agents and the Console playground store data | Responses API with `store` omitted; Conversations (kept until deleted) | Opt-in logs and datasets (kept up to 55 days; sharing a dataset puts it under unpaid terms) |
| Processing terms | Data Processing Addendum incorporated into the Commercial Terms | API data controls; DPA available | Google's Data Processing Addendum (Google as processor) |

## 4. Google Workspace user-data policy fit

Gmail read access (`gmail.readonly`) is a restricted scope. The Workspace API user-data policy (updated 3 September 2026) applies to whatever Maya does with that data, including sending it to a cloud AI processor.

| Policy requirement | What it means for Maya | Anthropic | OpenAI | Gemini paid |
|---|---|---|---|---|
| Limited Use: transfer data only "to provide or improve your appropriate use case or user-facing features that are visible and prominent … and only with the user's consent" | Drafting a reply the owner asked for is the user-facing feature; the "How Maya thinks" choice and the per-category grant are the consent | Fits | Fits | Fits |
| No "transferring, selling, or using user data to create, train, or improve a machine learning or artificial intelligence model beyond that specific user's personalized model" | The processor's terms must forbid training on the data (technical §4) | Fits: contractual no-training | Fits unless the organization opts in to data sharing | Fits only on a billing-enabled project; a key from an unpaid project would break the policy |
| Human access to the data only with consent, for security, or by law | Maya's team never reads it. Provider abuse review of flagged content is a security purpose and is disclosed | Disclosed flagged-content review | Disclosed abuse monitoring | Disclosed abuse monitoring |
| "Protecting against prompt injection techniques by either using Google Cloud Platform's Model Armor or other prompt injection protection" | Provided by Maya itself: untrusted content cannot create grants, approvals or recipients, and tool requests are validated deterministically (technical §5, FD-16b). This does not depend on the provider | Maya's control | Maya's control | Maya's control |
| Security assessment: "If you store or transmit restricted scope data on servers, then you need to complete a security assessment" | Sending Gmail content to **any** cloud processor transmits restricted data to a server. Public release therefore needs Google's annual security assessment (CASA), whichever provider is chosen. The spike runs under the personal-use and testing exceptions | Same | Same | Same |

**Result:** all three can fit the policy. Gemini carries the one provider-specific failure mode: its free tier's terms break the no-training rule. Anthropic and OpenAI fit equally, as long as Maya follows the conditions in §6 (and, for OpenAI, always sends `store: false`).

## 5. Cost per task

**Reference task.** The product blueprint §6 worked example as three model calls, fixed in [`spikes/cloud-ai/reference-task.mjs`](../../spikes/cloud-ai/reference-task.mjs):

1. Plan: understand "Read Priya's latest email about the launch and draft a reply saying Tuesday works" and request the tools.
2. Draft: with the (fictional) email and a primary-calendar availability result as tool results, draft the reply.
3. Revise: shorten the draft after one owner edit request.

Every call carries Maya's system prompt and tool definitions. All content is made up (`example.com`/`example.org` addresses); no real mail is sent anywhere.

**Published-price estimate.** Production prompts will be larger than the fixture. The estimate therefore uses a conservative envelope of 12,000 input and 2,000 output tokens per task, without prompt caching, at standard prices (US$ per million tokens, read 26 September 2026):

| Provider | Model | Input / output price | Estimated cost per task |
|---|---|---|---|
| Anthropic | Claude Sonnet 5 | 2 / 10 | US$0.044 |
| Anthropic | Claude Haiku 4.5 | 1 / 5 | US$0.022 |
| OpenAI | gpt-6-sol | 2 / 10 | US$0.044 |
| OpenAI | gpt-6-luna | 0.10 / 0.50 | US$0.0022 |
| Google | Gemini 3.1 Pro Preview | 2 / 12 | US$0.048 |
| Google | Gemini 3.8 Flash | 0.75 / 3.75 until 31 Dec 2026, then 1.50 / 7.50 | US$0.0165, then US$0.033 |

Tokenizers differ, so the same text is a different number of tokens at each provider. Anthropic states that Claude 4.7 and later models (including Sonnet 5, but not Haiku 4.5) produce about 30% more tokens for the same text. On that basis Sonnet 5's envelope estimate rises to about US$0.057. This is why the chosen provider is measured rather than only estimated.

**Measurement.** `node spikes/cloud-ai/measure.mjs --live` runs the reference task on the Claude API (by default 5 runs per model; Sonnet 5, then Haiku 4.5). It reads the token counts the API returns, prices them at the rates above, and writes [cloud-ai-measurements.md](cloud-ai-measurements.md). No prompt caching is used, extended thinking is explicitly disabled, output is capped at 1,024 tokens per call, and there are no automatic retries. The run stops at the first error, at the first response from a model other than the one requested, and at the first response without token counts, and then it does not write the measurements file; a partial run is never reported. A full run costs well under US$1.

**Target and default-model rule.** The owner's target is at most US$0.05 per reference task. The spike's default model is the first of `claude-sonnet-5`, then `claude-haiku-4-5-20251001`, whose mean measured cost per reference task is within the target. If neither is within it, there is no default, and the owner decides in SP-08. At the target, the US$50 a month spike budget covers at least 1,000 tasks a month.

**Limits of the fixture.** The reference task is much smaller than the envelope above, so a model within target on the fixture is not shown to be within target on production prompts; on the envelope, Sonnet 5 (about US$0.057) is over it. The measurements file shows the fixture's mean token counts next to the envelope. FD-15 records real cost per task and the beta measures it against the same target (§9).

## 6. Conditions of use with Anthropic

These bind the model gateway (FD-15) and anything else that calls the provider.

1. **Messages API only**, with the owner's API key under Anthropic's Commercial Terms: no consumer Claude plan, no Console playground with real data, and no Files API, Batch API, code execution or Managed Agents, all of which store data. Prompt caching (in memory, 5 minutes or 1 hour) may be adopted by FD-15; it is not used in the spike.
2. **Models:** only non-Covered models, currently `claude-sonnet-5` and `claude-haiku-4-5-20251001`. Covered Models (Claude Fable 5/5.1, Mythos 5/5.1) require 30-day retention even under ZDR and are excluded. The model id is configuration, not code, so the model can change without changing the provider decision.
3. **No training opt-in:** the organization that owns the key is never enrolled in any programme that lets Anthropic use its API data for training or product improvement.
4. **Egress:** every request passes Maya's egress check over the complete assembled request, and only the owner's granted categories leave the device (technical §2). Raw audio and attachments are never sent. Event details are sent only after their own opt-in.
5. **Disclosure** in "How Maya thinks", at the point of consent:
   - the provider (Anthropic);
   - the categories;
   - retention: "Anthropic deletes what Maya sends within 30 days and does not train on it; content its safety systems flag may be kept for up to 2 years, and the law can require longer";
   - that local deletion cannot erase the provider's copy;
   - the approximate cost per task on the owner's key.
6. **Terms re-check:** these terms are read again before the private beta and before public release. A change that allows training, or that retains data longer than disclosed, stops cloud processing until the owner decides again.

## 7. Key handling for the spike

- The owner creates an API key in the Claude Console, in a workspace used only for Maya (for example `maya-spike`), with a monthly spend limit no higher than the US$50 spike budget.
- The owner puts it in the gitignored `.env` on the Home PC as `MAYA_CLOUD_AI_API_KEY=<key>`: in `C:\code\maya\.env`, and in the task worktree's own `.env` if the worktree already exists. The name deliberately avoids `ANTHROPIC_API_KEY`, which Anthropic's SDKs and Claude Code pick up automatically; that could switch an agent's billing or expose the key to tools that were never meant to use it.
- The key never appears in an `ask_user` question or answer, a prompt, a model request body, an Agentify artifact, a commit, a log or the terminal. Agents may ask only whether the variable is set.
- `spikes/cloud-ai/measure.mjs` reads only that one variable (from the environment, or else from `.env`). It sends the key only in the `x-api-key` header over HTTPS to `api.anthropic.com`, never prints headers or request bodies, and redacts the key from any error text it prints.
- If the key may have been exposed, the owner revokes it in the Console and creates a new one; nothing in the repository changes. The spike key is revoked when the spike ends, or kept for FD-15 development at the owner's choice.

## 8. Key handling in the product

- The Home PC keeps the cloud AI key in the OS-protected vault (FD-02), behind the credential boundary. It never goes into model prompts, logs, the relay, device sync or backups (technical §5, §7).
- Only the model gateway (FD-15) uses the key, to call the provider. Clients, the planner and read workers cannot obtain it.
- If the Home PC is lost or replaced without a clean migration, the owner revokes and rotates the key before a replacement is activated (technical §5).
- No shared vendor key is ever shipped. The user-facing credential and billing flow is decided before public release ([DECISIONS.md](../DECISIONS.md), 2026-09-26).

## 9. Not settled here

- **Answer quality.** Technical §9 asks for quality to be validated before 1.0; drafting quality on Claude is judged in FD-15 and the private beta. If it proves inadequate, the provider question goes back to the owner.
- **Google's security assessment.** CASA applies at public release (§4); the path is documented in SP-01 and consolidated in SP-08.
- **ZDR for users.** ZDR is arranged per organization through Anthropic's sales team, so it can't be assumed for users who bring their own key. The disclosure in §6 uses the standard 30-day terms.
- **Cost in production.** Real prompts and multi-turn tasks will cost more than the fixture (§5, limits of the fixture). FD-15 records cost per task, and the beta measures it against the owner's target (product §8).

## 10. Sources (read 26 September 2026)

- Anthropic, API and data retention: https://platform.claude.com/docs/en/manage-claude/api-and-data-retention
- Anthropic, How long do you store my organization's data? (updated 1 July 2026): https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data
- Anthropic, Commercial Terms of Service: https://www.anthropic.com/legal/commercial-terms
- Anthropic, Pricing: https://platform.claude.com/docs/en/about-claude/pricing
- OpenAI, Data controls in the OpenAI platform: https://developers.openai.com/api/docs/guides/your-data
- OpenAI, Pricing: https://developers.openai.com/api/docs/pricing
- Google, Gemini API Additional Terms of Service (last modified 23 March 2026): https://ai.google.dev/gemini-api/terms
- Google, Gemini API abuse monitoring (updated 9 June 2026): https://ai.google.dev/gemini-api/docs/usage-policies
- Google, Gemini API data logging and sharing (updated 4 September 2026): https://ai.google.dev/gemini-api/docs/logs-policy
- Google, Gemini API billing (updated 20 September 2026): https://ai.google.dev/gemini-api/docs/billing
- Google, Gemini API pricing: https://ai.google.dev/gemini-api/docs/pricing
- Google, Workspace API user data and developer policy (updated 3 September 2026): https://developers.google.com/workspace/workspace-api-user-data-developer-policy
- Google, Restricted scope verification: https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
