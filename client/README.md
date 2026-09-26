# Maya client

## What this is

The Maya Flutter client skeleton. It targets Android, iOS, Linux, macOS and Windows.

## Toolchain

Flutter 3.47.5 stable at `C:\Users\yashp\develop\flutter`. Windows builds require the Visual Studio C++ toolchain.

## Commands

Run these commands from `client/`:

```sh
flutter pub get
flutter analyze --fatal-infos
flutter test
flutter run -d windows
flutter build windows
```

## Checks

Checks are registered in `maya.checks.json` and run by `node scripts/check.mjs` from the repository root.

## Platforms

- The beta desktop OS is Windows (`docs/DECISIONS.md`, 2026-09-26), so no other desktop build step is needed for the beta.
- Android device setup is M0-05.
- iOS and macOS builds need a Mac with Xcode, and Linux builds need a Linux host. Those are later owner steps, not done here.
- Windows plugins will need Developer Mode (symlinks) once a plugin is added.
