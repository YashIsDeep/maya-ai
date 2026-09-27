# Implementation: [M0-03] Install the Flutter toolchain and create the client skeleton

## Changes

- Installed Flutter 3.47.5 stable with Dart 3.13.4 at `C:\Users\yashp\develop\flutter` after verifying Google's Windows release archive SHA-256.
- Added the `client/` Flutter app with Android, iOS, Linux, macOS and Windows targets. The app is titled `Maya` and displays `Maya`; the generated package remains `maya` with organization ID `com.yashgupta`.
- Added `client/test/app_test.dart`, registered `flutter analyze --fatal-infos` and `flutter test` in `client/maya.checks.json`, and committed `client/pubspec.lock`.
- Set the Maya display name for Windows, Linux, Android, iOS and macOS. iOS's generated `CFBundleDisplayName` was already `Maya`.
- Added the platform setup notes to `client/README.md`, recorded the delegated toolchain decisions in `docs/DECISIONS.md`, and marked `.ico` files binary in `.gitattributes`.

## Toolchain and `flutter doctor -v`

The official archive URL was `https://storage.googleapis.com/flutter_infra_release/releases/stable/windows/flutter_windows_3.47.5-stable.zip`. Its HTTP `Content-Length` was 1,933,437,428 bytes. The SHA-256 after download was `0ccd71931f49c2fbe394b1eeb6d79af3d624058a043ea0d03d34160581624fb8`; it matched both the live `releases_windows.json` entry and the approved plan. The archive was extracted to the approved SDK folder and removed from temp.

The initial doctor report identified Windows 10 Pro 22H2, Flutter 3.47.5 stable, Dart 3.13.4 and DevTools 2.60.0. Chrome and the Windows device were available. Android SDK was absent as expected for M0-05, and Visual Studio was not yet installed. After the approved Build Tools install, the Visual Studio section was green: Visual Studio Build Tools 2026 version 18.10.12217.157 and Windows 10 SDK 10.0.26100.0. Android SDK remained absent. The first Agentify process predated the HKCU PATH update and could not resolve Flutter; the restart was still outstanding at the end of that attempt.

The Build Tools bootstrapper's Authenticode status was `Valid`, with signer subject `CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond, S=Washington, C=US`. The approved installer command exited 0.

## Owner steps

Install steps 1–4 were performed after their corresponding `ask_user` approvals; the restart and launch confirmation are recorded individually below.

1. **Flutter SDK download, verification and extraction.** The approval question named the official URL, 1,933,437,428-byte size, expected hash, target folder and first-use artifact downloads. Owner answer: **“Approve this exact install.”** The archive hash matched the live release list and the plan.
2. **User PATH.** The approval question named `C:\Users\yashp\develop\flutter\bin`, HKCU, no admin rights, raw-entry preservation and the environment-change broadcast. Owner answer: **“Approve this PATH update.”** The path was prepended as `REG_EXPAND_SZ`, preserving unexpanded entries, and `WM_SETTINGCHANGE` was broadcast.
3. **Analytics.** The approval question named the full-path `flutter --disable-analytics` and `dart --disable-analytics` commands and their per-user config writes. Owner answer: **“Approve both commands.”** Both commands succeeded.
4. **Visual Studio C++ toolchain.** After doctor reported Visual Studio missing, the approval question named `https://aka.ms/vs/stable/vs_BuildTools.exe`, the approved C++ workload arguments, the several-GB download and UAC prompt. Owner answer: **“Approve this Build Tools install.”** The signed bootstrapper ran with `--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --passive --wait --norestart` and exited 0. The 2022 fallback was not needed.
5. **Agentify restart.** The owner skipped the original restart question. That run survived, so I followed the plan's surviving-run path and added the SDK `bin` only to local command environments; those checks did not prove Agentify's PATH. After the Review finding requested a restart before retry, this rework Implement process inherited Flutter on its PATH, as recorded below. The next Review-stage `.agentify/review/checks.txt` remains the workflow evidence for both client checks under the restarted Agentify process.
6. **Windows launch confirmation.** After the process assertion, the owner answered **“Yes”** to seeing a window titled `Maya` with `Maya` in the middle.

## Checks and Windows launch

- `flutter analyze --fatal-infos` — passed: no issues found.
- `flutter test` — passed: the `MayaApp` widget test passed.
- `node scripts/check.mjs` — the initial implementation run recorded 12/12 checks, including `client analyze` and `client tests`; it used the surviving-run local Flutter PATH adjustment. The rework check run is recorded below.
- The initial clean-state check run began after `flutter clean` removed `client/.dart_tool`; it recorded 12/12 checks and an empty `git status --porcelain --untracked-files=all` afterward.
- `flutter build windows --debug` — succeeded. Output tail:

  ```text
  Building Windows application... 25.3s
  √ Built build\windows\x64\runner\Debug\maya.exe
  ```

- The app was started from `client\build\windows\x64\runner\Debug\maya.exe`. After 10 seconds, `Get-Process maya` found PID 24480 with `MainWindowTitle: Maya` and `HasExited: False`. The owner confirmed the visible window and the process was stopped.

## Assumptions and follow-up

- The owner had delegated the reversible SDK, toolchain, analytics and organization-ID choices to the planner's recommendations. The recorded SDK is Flutter 3.47.5 stable / Dart 3.13.4, analytics are off, and the organization ID is `com.yashgupta`.
- Android SDK/device setup is M0-05. iOS and macOS builds need a Mac with Xcode, and Linux builds need a Linux host; those owner steps remain later work as documented in `client/README.md`.

## Rework verification (2026-09-27)

- `where.exe flutter` resolved `C:\Users\yashp\develop\flutter\bin\flutter` and `flutter.bat` from the process's inherited PATH. `flutter --version --machine` reported Flutter 3.47.5 stable, Dart 3.13.4, and `flutterRoot` `C:\Users\yashp\develop\flutter`. No session-local PATH prepend was used.
- `flutter doctor -v` reported Windows 10 Pro 22H2, Flutter 3.47.5 stable, Dart 3.13.4, and a green Windows section: Visual Studio Build Tools 2026 version 18.10.12217.157 with Windows 10 SDK 10.0.26100.0. Android SDK remains absent, as expected for M0-05.
- Compared `client/analysis_options.yaml` with `5a8b912:client/analysis_options.yaml`; the exclude block matches the generated file exactly, so it was left unchanged.
- `flutter clean` removed `client/.dart_tool`. Then `node scripts/check.mjs` passed all 13 registered checks, including `client analyze` (`No issues found!`) and `client tests` (`All tests passed!`). The check runner resolved Flutter without any session PATH adjustment.
- The earlier Review artifact's 11/13 result captured its stale PATH. This rework run now has inherited Flutter resolution; the fresh Review run should record both client checks passing in `.agentify/review/checks.txt`.

---


# Implementation: [M0-02] Create the TypeScript coordinator workspace

## Changes

- Added a private npm workspaces root using Node 24, strict TypeScript 7.0.2, ES modules, Oxlint with tsgolint, and Prettier.
- Added the empty `@maya/coordinator` application package and the `@maya/domain` source package, linked as a workspace dependency.
- Added one built-in `node:test` test per package. The coordinator test imports the domain package by its workspace name.
- Registered install, formatting, test, typecheck, and lint checks. Preserved the existing root and `docs/agentify` checks.
- Added README build and test instructions and recorded the M0-02 owner decisions.

## Checks

- `npm install -D -E typescript@7.0.2 oxlint@1.85.0 oxlint-tsgolint@7.0.2003 prettier@3.9.9 @types/node@24` — passed; the exact `@types/node` version resolved to 24.19.0.
- `npm run format` — passed.
- `node scripts/check.mjs` — passed, 10/10 registered checks. This includes two existing checks (the root Agentify tick tests and the `docs/agentify` smoke sentence) and eight M0-02 checks. The tick suite passed all 45 tests.

## Negative verification

Each temporary fault was reverted immediately after its check. None is committed.

- Added an un-awaited `Promise.resolve()` to `packages/domain/src/index.ts`; `npm run lint --workspace @maya/domain` failed at `src/index.ts:4:1` with `typescript(no-floating-promises): Promises must be awaited`.
- Added `const x: number = "a";` to `packages/domain/src/index.ts`; `npm run typecheck --workspace @maya/domain` failed at `src/index.ts(4,7)` with `TS2322: Type 'string' is not assignable to type 'number'.`
- Removed required spaces from the domain export; `npm run format:check` failed and reported `[warn] packages/domain/src/index.ts` and `Code style issues found in the above file.`
- Changed the coordinator assertion to expect `"wrong"`; `npm test --workspace @maya/coordinator` failed at `src\workspace.test.ts:5:1` with `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:`.
- Restored all four files and confirmed `npm run format:check` passes.

## Assumptions

- `@types/node` 24.19.0 is the newest published 24.x version available to the pinned install, saved exactly.
- The root Node engine range is `^24.0.0`, and Prettier uses its defaults with `printWidth` 120, as specified in the approved plan.
- The existing registered checks remain in place; the actual complete check count is 10/10.

## Owner steps

None.

## Follow-up

None.

---

# Implementation: [SP-04] Spike: choose the cloud AI processor

## Changes

- Added the approved provider comparison in `docs/spike/cloud-ai.md` and appended the three owner decisions to `docs/DECISIONS.md`.
- Added the Claude pricing, fictional plan/draft/revise fixture, pure measurement helpers, live/dry-run CLI, 16 offline tests, and the registered check in `spikes/cloud-ai/`.
- Generated and committed `docs/spike/cloud-ai-measurements.md` in dry-run mode.
- Left both blueprints unchanged.

## Checks

- `node spikes/cloud-ai/measure.mjs --dry-run` — passed; generated the dry-run report without reading a key or making API calls.
- `node --test spikes/cloud-ai/test/cloud-ai.test.mjs` — passed, 16/16.
- `node scripts/check.mjs` — passed, 11/11 registered checks.
- Confirmed `.env` is not tracked, the committed diff contains no forbidden key-prefix string, and the blueprints have no diff from `main`.

## Assumptions

- Provider terms and prices are those in the approved report, sourced as of 26 September 2026; they must be rechecked before beta and public release.
- The API key, when used, is the owner's Claude Console key under Anthropic's Commercial Terms.
- Answer quality remains for FD-15 and the private beta.

## Owner steps

- Asked through Agentify whether `MAYA_CLOUD_AI_API_KEY` is set in the task worktree's `.env`. No answer arrived during the first extended wait, so I repeated the same question once as required by §3.2; the repeated request also remained unanswered beyond the expected timeout window.
- Did not inspect `.env`, request approval for the live run, or make any provider calls. The measurements file therefore remains the generated dry-run report.

## Follow-up

- After the owner answers the key-status question, request separate approval for the exact live command in the approved plan. If approved, run it unchanged; if it fails, retain the dry-run report and record the redacted error as specified.
