# Verification

## Local Mac build

The first Tauri/Rust macOS ARM64 app bundle builds successfully. The bundle is approximately 11.2 MiB, excluding the externally installed Codex engine. This is a package-size measurement, not a runtime memory benchmark. The local bundle’s ad-hoc signature was verified after packaging. The app was launched locally; its native store was created and populated with the current Codex model.

Rust checks passed, including persistence recovery, workspace boundary checks, and a live Codex transport test that streamed `ClaudeX Rust transport works.` and resumed the same native thread. The test thread was archived afterward. The JavaScript persistence tests and TypeScript/production frontend build pass.

The shared React interface retains the previously approved design. Browser checks cover drafts, preferences, search, file previews, streaming, skills, workspace errors, and responsive layouts. The original web implementation additionally completed a live file-editing approval and restart/stop checks.

## Verification limits

The Mac was locked when native computer-use verification was attempted. Native window interaction, native save/folder dialogs, and actual WebKit rendering are therefore pending manual evaluation after unlock. Do not interpret the successful build or Rust transport test as full native GUI certification.

Windows has platform-aware executable discovery, paths, dialogs, storage, and packaging configuration. No Windows build or runtime test has been performed here. CI and public binary releases are deferred until the owner accepts the local first version.

## Source hygiene

Dependencies, compiled Rust output, frontend bundles, installers, private local state, logs, generated permission schemas, and test/reference screenshots are ignored. The public repository contains source, English documentation, lockfiles, and small app icons. No API keys, account tokens, personal conversation data, or proprietary Claude assets are included.

Shared history correction: a read-only live test verified listing existing local Codex threads and loading a saved transcript. No existing thread was renamed, archived, deleted, or sent an inference request during this test. Unit tests verify matching original thread IDs, avoiding duplicates, timestamp conversion, and preserving active local turns.

Codex-only sidebar: four Rust unit tests passed, including legacy/canonical project ID mapping, explicit projectless assignments, exact-root fallback, and project ordering. The read-only local history test also passed against live project and desktop assignment metadata. Browser regression checks and a fixture-based desktop/mobile sidebar test passed (project grouping, five-row limit, Show more, collapsed Recents, and no mode switch). Screenshots were inspected for the shared React interface; native window automation remains unavailable. No existing Codex history was modified during these checks.

Conversation-menu correction: browser checks verified a body-level menu portal, desktop/mobile viewport bounds, unobstructed Delete-row hit testing, arrow-key focus, Escape dismissal, and the R shortcut opening the rename dialog without saving. Screenshots were inspected at both sizes. Existing Codex conversations were not modified.
