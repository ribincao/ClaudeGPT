# ClaudeGPT / Codex parity audit

Audit date: 2026-10-15. Source baseline: `5c03dba`. Installed engine: `codex-cli 0.162.0-alpha.17.2`.

## Scope and evidence

This is a source and protocol audit of the **native Rust/Tauri client**, checked against current official documentation and JSON schemas generated from the installed engine, both stable and experimental. The optional Node web preview is a styling tool with its own index; it is not evidence of native parity. This report does not certify every native interaction or Windows support. No runtime features were changed for this audit.

The goal is Codex behavior and data behind the existing Claude-inspired interface. A similar control does not count as equivalent behavior. Items below distinguish implementation defects, missing interfaces for engine capabilities, and desktop integrations requiring separate engineering. Priorities are recommendations, not a promise to ship everything.

## Already implemented

- Local Codex engine discovery, manual executable selection, reconnect, existing authentication reuse, and browser-based ChatGPT sign-in.
- Cursor-paginated active/archived local thread discovery, original thread IDs, transcript hydration, and project grouping with a legacy desktop-metadata fallback.
- Streaming assistant text, command output, basic file-change/MCP/search cards, task-plan updates, interrupt requests, basic approvals, and user questions.
- Rename, archive, restore, confirmed original-thread deletion, local pinning, image/text/source attachments, installed-skill selection, and workspace file previews.
- Markdown/code copying, native external-link opening, selected-chat Markdown export, cache JSON export, appearance preferences, persistent zoom, and native dialogs.

These are partial foundations where the backlog below identifies limitations.

## P0 — Correct existing behavior first

| ID | Current mismatch / evidence | Required result and acceptance check |
| --- | --- | --- |
| C01 | **Saved conversation settings are overridden.** `routes.rs:485–594` selects global model/effort/approval settings and sends an explicit sandbox on every turn. Imported conversations are mapped to Work. | Read effective thread/config settings; preserve them unless the user explicitly changes them. Reopen a thread with different model/permission settings and verify the next request preserves those values. Display the actual effective values. |
| C02 | **Runtime state is incomplete.** `history.rs` imports chats as idle; `lib.rs:165–246` omits thread-status/closed and request-resolved notifications. Refresh does not fully reconcile saved metadata. | Show authoritative running/waiting/completed/failed states, clear externally resolved approvals, and reconcile after focus/reconnect. Validate a conversation changed from another client. |
| C03 | **Writer ownership has only an error message.** The previous active-writer error is explained and drafts survive, but there is no supported recovery workflow. | Explain which actions are possible; offer an explicit fork when supported, and retry after ownership is actually released. Never silently fork or force-unlock. Test an occupied original thread and verify its ID/history remain intact. |
| C04 | **Some model activity disappears.** `App.tsx:264` renders six main item kinds and returns nothing for other kinds; the reducer handles only a subset of deltas. | Add supported reasoning summaries, plan deltas, agent/tool activity, image results, compaction/review states, and a useful fallback for unknown items. Replay fixtures for every supported type; never invent hidden reasoning text. |
| C05 | **Approval handling loses protocol choices.** `routes.rs:300–341` and `ApprovalRequest` support basic choices; permission grants are turn-scoped and MCP elicitation is declined. | Render the choices and scopes actually offered by each request, including network details and supported amendments. Complete supported structured forms, and handle resolution/cancellation from another client. |
| C06 | **Search and bulk export depend on the cache.** `App.tsx:165` searches loaded items; unopened histories may have no cached transcript. `/export` returns cached JSON only. | Search authoritative history where supported, with explicit fallback coverage. Distinguish cache export from complete export and paginate as needed. Selected-chat Markdown already hydrates first, but omits tool/attachment detail. |
| C07 | **Failed or timed-out sends are ambiguous.** `routes.rs:583` appends a pending message before acceptance; failure can leave it in the transcript. `engine.rs` drops structured error data and applies a 45-second RPC timeout. | Mark pending/unsent/accepted explicitly, preserve structured errors, and reconcile against the server before offering a retry. Verify a timeout cannot cause duplicate turns. Test Stop before the turn ID is known. |
| C08 | **Compatibility is assumed.** `engine.rs:120` requests experimental APIs but discards initialization information; model listing uses one page. | Record engine/server version, check required schemas/capabilities, paginate lists, and disable unsupported controls with clear explanations. Test the minimum supported version and the installed engine. |

Ownership caveat: the official App Server documentation describes an idle retention period after the final unsubscribe. An unsubscribe button must not promise immediate writer release. Forking creates a separate conversation; it is not synchronization of the original writer.

## P1 — Complete the everyday Codex workflow

| ID | Status today | Next increment / acceptance |
| --- | --- | --- |
| F01 | **Pins and sections: local-only / missing.** PATCH pin changes ClaudeGPT JSON. | Synchronize supported canonical sections/pinning and ordering, then verify both clients reflect the change. See the version warning below before selecting a protocol field. |
| F02 | **Projects: display-only.** Existing grouping is read, with private desktop metadata as fallback. | Create/rename/delete/reorder projects, assign or move chats, and make New chat inherit its selected project. Support multiple roots where the installed engine exposes them. Avoid writing private desktop metadata. |
| F03 | **Steering and follow-up queue: missing.** Sending is blocked during a running turn. | Add supported mid-turn steering and a clearly distinct queued-next-message action. Verify ordering, cancellation, and reconnection. |
| F04 | **Branch, edit, retry, revert: missing.** | Implement explicit forks first; then design edit/retry around supported history operations. Verify the original stays intact. History revert is not filesystem undo, and support depends on thread storage format. |
| F05 | **Real Plan mode: missing.** A Plan suggestion and task-plan display exist. | Use the engine's supported collaboration mode, show its active state, collect requested answers, and explicitly transition from plan to implementation. A prompt template alone is not Plan mode. |
| F06 | **Context management: partial.** Token updates are received without a useful context interface. | Display available context/token information and supported manual compaction; preserve server summaries. Add thread goals only when capability-checked and useful. |
| F07 | **File context and persistent artifacts: partial.** Images and text are accepted; other files are rejected or text is inlined. | Add file mentions/search and clear context chips; connect supported thread attachments and artifact outputs. PDF/Word ingestion needs a defined model/extraction path, not merely a permissive file picker. |
| F08 | **Git review: missing.** File-change cards are not a Git workspace. | Add actual repository status, readable diffs and review comments, then stage/revert and commit controls. Require explicit actions for destructive Git operations and publishing. |
| F09 | **Interactive terminal: missing.** Streamed agent command output is not a terminal session. | Add a managed terminal with input, resize, lifecycle, cancellation, and output limits. Test long-running tasks and process cleanup on Mac and Windows. |
| F10 | **Account and provider handling: partial.** Existing sign-in works; no logout/device-code/API-key UI. `ready` requires a non-null account. | Respect `requiresOpenaiAuth`, provider configuration and supported auth modes. Expose account switching/logout through supported operations; keep credentials out of React state. |
| F11 | **Effective configuration: missing.** UI stores its own defaults instead of exposing Codex config/profiles/requirements. | Read effective config and policy requirements; expose supported model, reasoning, service-tier and permission-profile choices progressively. Clearly distinguish per-thread overrides from global defaults. |
| F12 | **Instructions: inconsistent.** Settings promises custom instructions for reopened chats, but imported-thread resume does not apply the local text. | Define new-thread versus existing-thread behavior explicitly and show inherited project instructions without silently replacing them. Test existing AGENTS.md/config behavior before adding edits. |
| F13 | **MCP, connectors, plugins, skills: partial.** Installed skills can be selected; generic MCP calls can be displayed. | Add status/auth/configuration and supported tool forms; skill enable/disable and plugin management should follow engine capabilities. Do not equate listing installed skills with managing integrations. |
| F14 | **Conversation tools: partial.** Rename/archive/delete/export exist; no new window, branch menu, or richer navigation. | Add supported conversation actions and keyboard navigation incrementally. Preserve compact rows and portal menus; disabled actions must explain their actual limitation. |

## P2 — Desktop integrations and later work

These are absent today. Some require ClaudeGPT-owned infrastructure or OS integration rather than a single App Server request.

| ID | Missing area | Implementation boundary |
| --- | --- | --- |
| D01 | Worktrees and local/worktree handoff | Manage Git isolation, cleanup, ignored-file policy, and active-process ownership. Integrate project setup scripts and actions only with a documented compatibility contract. |
| D02 | Multi-window and desktop completion signals | Native window management, notification permission, badge/unread state, and focus behavior. The current app has one window and single-instance focusing. |
| D03 | Scheduled tasks and proactive follow-ups | Need scheduling, persistence, execution context and notification semantics. Existing first-party desktop automation does not establish an equivalent public local scheduling endpoint. |
| D04 | Remote/cloud environments and cross-device continuity | Local `thread/list` does not enumerate every hosted task or remote machine. Verify authentication, APIs and ownership before promising these features. |
| D05 | Voice/realtime input and output | The installed experimental schema includes realtime methods, but microphone/audio playback, permission UX and full compatibility still need implementation and testing. |
| D06 | Rich browser/computer tools and embedded app views | A protocol tool entry alone does not supply the first-party desktop host environment. Discover supported integrations before designing interactive views. |
| D07 | Windows runtime validation and distribution | Source/config targets Windows; no actual build/runtime certification yet. Public installers, signing/update strategy and CI remain intentionally deferred until local acceptance. |
| D08 | Large-history performance and diagnostics | Transcripts are hydrated into memory across all pages. Add incremental loading/virtualization as needed, diagnostic logs with redaction, and a support view for engine/version/errors. |

## Documentation discrepancies

- The Settings page still shows Chat/Work descriptions although the composer switch was removed.
- Prior README copy said saved permissions were retained, but C01 contradicts that claim. The README now flags the limitation.
- Pinning and cache export should not be described as synchronized/full-history operations.
- Some native UI text says “this Mac” although Windows is a target.
- The developer web preview and desktop backend have separate behavior; parity work must be validated through the Rust transport too.

## Version-specific findings

The public docs and this installed alpha engine are not identical. For example, current docs describe `thread/metadata/update.isPinned`, but neither generated stable nor experimental `ThreadMetadataUpdateParams` on this installation has that field. This installation exposes thread-section methods instead. Verify their semantics before implementing F01; do not send a documented field blindly.

Project management, history search, collaboration-mode discovery, permission profiles, plugins and realtime methods appear in this installation's experimental schema. Treat these as version-dependent, not portable guarantees. Schema presence is not proof that every account/backend enables a feature.

Reproduce the schema check with your actual executable:

```sh
codex --version
codex app-server generate-json-schema --out /tmp/claudegpt-protocol-stable
codex app-server generate-json-schema --experimental --out /tmp/claudegpt-protocol-experimental
```

## Recommended sequence

1. C08 + C01: establish compatibility and preserve effective conversation configuration.
2. C02 + C07: reconcile lifecycle, approval state and send failures reliably.
3. C03 + F04 (fork only): make writer conflicts understandable and recoverable without altering the original thread.
4. C04 + C05: display the engine's activity and requests faithfully.
5. C06 + F01 + F02: authoritative search, organization and project-aware creation.
6. F03 + F05 + F06 + F12: steering, planning, context and instruction behavior.
7. F07–F11 + F13–F14: richer coding tools, integrations and conversation controls.
8. D01–D08: select advanced integrations according to actual demand; keep the main interface light.

For each increment, update this report, add a focused protocol regression where behavior warrants it, and verify the real native path. Do not mark a feature complete based only on a mocked browser test.

## Outside the current target

Custom ChatGPT website UI/history sync remains paused by request; this audit does not imply that Codex sign-in grants that access. A ChatGPT profile-photo field is not provided by the account response currently used; optional local avatar upload is a preference feature. Pets and visible branding are not parity requirements. No in-app logos should be reintroduced.

## Official references

- [App Server protocol](https://learn.chatgpt.com/docs/app-server): thread operations, event/request handling and compatibility reference. Installed schema findings above were checked separately.
- [Projects](https://learn.chatgpt.com/docs/projects): first-party project workflow reference.
- [Permission modes](https://learn.chatgpt.com/docs/permission-modes): user-facing permission workflow reference.
- [Git worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees): desktop isolation workflow reference.
- [Local environments](https://learn.chatgpt.com/docs/environments/local-environment): setup scripts, actions and Git integration.
- [Integrated terminal](https://learn.chatgpt.com/docs/integrated-terminal): desktop terminal workflow reference.
- [Scheduled tasks](https://learn.chatgpt.com/docs/automations): first-party scheduling reference, not proof of a public scheduling API.

Source findings are anchored to the audit baseline; line numbers may move as implementation proceeds. The main evidence files are `src-tauri/src/{routes,lib,engine,history}.rs`, `web/src/{App,Composer,Settings,Markdown}.tsx`, and the native window/capability configuration.
