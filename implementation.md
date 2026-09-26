# Implementation: [M0-03] Install the Flutter toolchain and create the client skeleton

## Changes

- Installed Flutter 3.47.5 stable with Dart 3.13.4 at `C:\Users\yashp\develop\flutter` after verifying Google's Windows release archive SHA-256.
- Added the `client/` Flutter app with Android, iOS, Linux, macOS and Windows targets. The app is titled `Maya` and displays `Maya`; the generated package remains `maya` with organization ID `com.yashgupta`.
- Added `client/test/app_test.dart`, registered `flutter analyze --fatal-infos` and `flutter test` in `client/maya.checks.json`, and committed `client/pubspec.lock`.
- Set the Maya display name for Windows, Linux, Android, iOS and macOS. iOS's generated `CFBundleDisplayName` was already `Maya`.
- Added the platform setup notes to `client/README.md`, recorded the delegated toolchain decisions in `docs/DECISIONS.md`, and marked `.ico` files binary in `.gitattributes`.

## Toolchain and `flutter doctor -v`

The official archive URL was `https://storage.googleapis.com/flutter_infra_release/releases/stable/windows/flutter_windows_3.47.5-stable.zip`. Its HTTP `Content-Length` was 1,933,437,428 bytes. The SHA-256 after download was `0ccd71931f49c2fbe394b1eeb6d79af3d624058a043ea0d03d34160581624fb8`; it matched both the live `releases_windows.json` entry and the approved plan. The archive was extracted to the approved SDK folder and removed from temp.

The initial doctor report identified Windows 10 Pro 22H2, Flutter 3.47.5 stable, Dart 3.13.4 and DevTools 2.60.0. Chrome and the Windows device were available. Android SDK was absent as expected for M0-05, and Visual Studio was not yet installed. After the approved Build Tools install, the Visual Studio section was green: Visual Studio Build Tools 2026 version 18.10.12217.157 and Windows 10 SDK 10.0.26100.0. Android SDK remained absent. The existing Agentify process still reported Flutter and Dart missing from its PATH because it predates the HKCU PATH update; the new Agentify PATH was not verified in this run.

The Build Tools bootstrapper's Authenticode status was `Valid`, with signer subject `CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond, S=Washington, C=US`. The approved installer command exited 0.

## Owner steps

Each approval below arrived through `ask_user` before its corresponding action.

1. **Flutter SDK download, verification and extraction.** The approval question named the official URL, 1,933,437,428-byte size, expected hash, target folder and first-use artifact downloads. Owner answer: **“Approve this exact install.”** The archive hash matched the live release list and the plan.
2. **User PATH.** The approval question named `C:\Users\yashp\develop\flutter\bin`, HKCU, no admin rights, raw-entry preservation and the environment-change broadcast. Owner answer: **“Approve this PATH update.”** The path was prepended as `REG_EXPAND_SZ`, preserving unexpanded entries, and `WM_SETTINGCHANGE` was broadcast.
3. **Analytics.** The approval question named the full-path `flutter --disable-analytics` and `dart --disable-analytics` commands and their per-user config writes. Owner answer: **“Approve both commands.”** Both commands succeeded.
4. **Visual Studio C++ toolchain.** After doctor reported Visual Studio missing, the approval question named `https://aka.ms/vs/stable/vs_BuildTools.exe`, the approved C++ workload arguments, the several-GB download and UAC prompt. Owner answer: **“Approve this Build Tools install.”** The signed bootstrapper ran with `--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --passive --wait --norestart` and exited 0. The 2022 fallback was not needed.
5. **Agentify restart.** The owner skipped the restart question. The run survived, so I followed the plan's surviving-run path and added the SDK `bin` only to local command environments. Agentify was not restarted by this run. Its Review-stage `.agentify/review/checks.txt` must still show both client checks passing after the owner restarts Agentify; local green checks do not prove the Agentify PATH.
6. **Windows launch confirmation.** After the process assertion, the owner answered **“Yes”** to seeing a window titled `Maya` with `Maya` in the middle.

## Checks and Windows launch

- `flutter analyze --fatal-infos` — passed: no issues found.
- `flutter test` — passed: the `MayaApp` widget test passed.
- `node scripts/check.mjs` — passed all 12 checks, including `client analyze` and `client tests`, the existing smoke check, root formatting, coordinator checks and domain checks. This was run with the surviving-run local Flutter PATH adjustment.
- The final check run began after `flutter clean` removed `client/.dart_tool`; all 12 checks passed and `git status --porcelain --untracked-files=all` was empty afterward.
- `flutter build windows --debug` — succeeded. Output tail:

  ```text
  Building Windows application... 25.3s
  √ Built build\windows\x64\runner\Debug\maya.exe
  ```

- The app was started from `client\build\windows\x64\runner\Debug\maya.exe`. After 10 seconds, `Get-Process maya` found PID 24480 with `MainWindowTitle: Maya` and `HasExited: False`. The owner confirmed the visible window and the process was stopped.

## Assumptions and follow-up

- The owner had delegated the reversible SDK, toolchain, analytics and organization-ID choices to the planner's recommendations. The recorded SDK is Flutter 3.47.5 stable / Dart 3.13.4, analytics are off, and the organization ID is `com.yashgupta`.
- The run did not restart Agentify after the PATH update. Before the Review checks can prove the new PATH, the owner needs to restart Agentify from a fresh terminal and the Review artifact must show `client analyze` and `client tests` passing.
- Android SDK/device setup is M0-05. iOS and macOS builds need a Mac with Xcode, and Linux builds need a Linux host; those owner steps remain later work as documented in `client/README.md`.
