<p align="center"><img src="web/public/favicon.svg" width="80" alt="ClaudeGPT icon"></p>
<h1 align="center">ClaudeGPT</h1>
<p align="center">A little more room to think.</p>

A lightweight, Claude-inspired desktop interface for **Codex**, built with **Tauri 2, Rust, and React**. This is a personal open-source project made for fun. macOS is the primary platform; the source also targets Windows.

## Features

- Real streaming Codex conversations with Markdown and copyable code blocks.
- Chat mode for reading and discussing; Work mode for editing inside a selected folder.
- Saved chats and drafts, search, pinning, renaming, archiving, and Markdown/JSON export.
- Model and reasoning controls, custom instructions, installed skills, and in-conversation approvals.
- Workspace file browser, text/Markdown previews, and image/text/source-code attachments.
- Quiet settings with light/dark/system themes, chat font, size, width, and reduced motion.
- Native folder/save dialogs, clipboard integration, single-instance handling, and remembered window position.

The desktop app talks to a local `codex app-server` from Rust. It uses the system webview. **No Node runtime or browser-preview server is required by the packaged desktop app.**

## Download

[GitHub Releases](https://github.com/ribincao/ClaudeGPT/releases) will hold downloadable Mac and Windows installers. **No public release has been published yet.** The first version is being evaluated locally before build CI and release automation are enabled.

When a release is available, download the installer for your platform, launch ClaudeGPT, and connect your installed Codex. Each release will document signing and platform requirements. This first local build is not a signed public distribution.

## Requirements

Install a current Codex CLI and sign in with your supported ChatGPT plan or API credentials. ClaudeGPT reuses Codex's own authentication; credentials never enter the React interface. On macOS it prefers the current Codex engine bundled with an installed ChatGPT desktop app. On Windows it checks PATH and the standard global npm installation. **Settings → Account** lets you choose an executable manually.

Codex is an external prerequisite, not vendored by this project. Model availability, inference billing, and limits remain those of your account.

## Run and build

Install [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), stable Rust, and Node.js 22+. macOS requires Xcode Command Line Tools. Windows requires Microsoft C++ build tools and WebView2.

```sh
git clone https://github.com/ribincao/ClaudeGPT.git
cd ClaudeGPT
npm ci
npm run dev
```

Build a local Mac application for evaluation (the build applies and verifies an ad-hoc local signature):

```sh
npm run build
open src-tauri/target/release/bundle/macos/ClaudeGPT.app
```

Build platform-specific installers on the matching operating system with `npm run build:desktop`. Tauri can produce a Mac app/DMG or Windows NSIS/MSI installers. No CI workflow runs in this first version; see [the release plan](docs/releases.md).

## Web preview for developers

The shared interface lives in **web/**. The optional browser preview uses a local Node server, while the desktop uses the Rust backend.

```sh
npm run dev:web       # Browser + local Codex at http://localhost:4317
npm run build:web     # TypeScript check and frontend bundle
npm run preview:web  # Detached production preview
npm run stop:web
```

The preview is for local styling and browser verification. Test native dialogs and desktop controls in the Tauri app too.

## Structure

```text
web/src/                 Shared React UI and transport adapter
web/public/              SVG icon assets
web/server/              Optional browser preview backend
web/scripts/             Browser and live integration tests
src-tauri/src/           Rust engine, action routing, and persistence
src-tauri/icons/         Mac and Windows app icons
src-tauri/capabilities/  Explicit desktop permissions
docs/                    Architecture, development, and release notes
DESIGN.md                Implemented visual system
LICENSE                  MIT
```

## Data and access

Desktop UI preferences, transcript cache, and attachments live in the operating system's application-data directory (`~/Library/Application Support/io.github.ribincao.claudex` on macOS). The preview uses separate, ignored `.data/` state. Prompts and selected context go to OpenAI through Codex during inference.

Chat requests read-only access. Work permits writes inside the chosen workspace; Codex can request additional approval. Grants are scoped to the current turn. Review important changes. Desktop deletion affects the original Codex thread after confirmation; the preview's Clear history only clears its own index.

## First-version scope

The core workflow is implemented. Custom avatars, pets, voice, PDF/Word ingestion, cloud sync, and external MCP form completion are future features. Unsupported forms can be declined. Saved local Codex threads are loaded automatically; regular ChatGPT website conversations and hosted-only history are not available through this local protocol.

Windows has a portable backend and packaging configuration but still needs an actual Windows build and runtime test. [Verification notes](VERIFICATION.md) distinguish tested behavior from intended support.

## Contributing

Forks and focused improvements are welcome. Keep comments, documentation, user-facing copy, and commit descriptions in English. Preserve the calm interface; expose advanced features progressively.

```sh
npm test
npm run test:rust
npm run build:web
npm run test:browser   # Requires the local preview and Chrome
```

See [development](docs/development.md) and [architecture](docs/architecture.md). Live-model tests use your Codex allowance; ordinary persistence tests do not.

## License and identity

[MIT](LICENSE) © 2026 Ribin Cao. ClaudeGPT is a personal, noncommercial hobby project; MIT permits modification, redistribution, and commercial reuse by others.

ClaudeGPT is independent and unaffiliated with Anthropic or OpenAI. Claude Desktop inspired the visual style; Codex provides the assistant engine. The orange-and-white icon derives from the OpenAI knot in [Simple Icons v11](https://cdn.jsdelivr.net/npm/simple-icons@11/icons/openai.svg). Third-party marks remain their owners' property. See [notices](THIRD_PARTY_NOTICES.md).

### Interface controls

Sidebar and Settings navigation use compact 28px rows and 16px icons. On macOS, use Command + plus/minus to zoom the whole interface and Command + 0 to reset. On Windows, use Ctrl instead. Desktop zoom ranges from 50% to 200% and persists across restarts. The web preview uses browser zoom.

### Shared Codex history and sign-in

The desktop app uses the installed Codex app-server and its existing Codex home/configuration. It reads saved local threads through `thread/list`, hydrates legacy and paginated transcripts through `thread/read` and `thread/turns/list`, and resumes the original thread ID. History refreshes on startup, window focus, and every 30 seconds while visible. Rename, archive, restore, and confirmed delete use Codex protocol methods and affect the original Codex thread. Pins and visual preferences remain ClaudeGPT-specific. Local JSON is a render cache and UI preferences, not a replacement Codex history store.

Settings → Account reuses the existing account or starts Codex's ChatGPT browser sign-in flow. This does not provide regular ChatGPT website conversations, cloud-only tasks, or complete parity with every proprietary desktop integration. Avoid sending turns to the same thread from two clients at once. The developer web preview still has its own conversation index.

### Codex-only navigation

The composer has no Chat/Work switch. New conversations use the Codex workspace-write workflow with explicit approvals; saved conversations retain their previous permissions. The desktop sidebar reads Codex projects, groups assigned threads under each project, shows five threads per project with Show more, and keeps unassigned threads under collapsed Recents. It uses Codex recency metadata for ordering. Where project assignment migration is incomplete, it reads the local desktop metadata as a compatibility fallback, without changing that file. This fallback is an internal format and may need updating after Codex upgrades.

External links in assistant replies open in the system default browser on desktop; email links use their registered mail app. Codex account data does not include a profile-photo field, so the account control currently uses a letter placeholder rather than synchronizing a ChatGPT avatar.

### Rename compatibility

ClaudeGPT retains its original `io.github.ribincao.claudex` application identifier, application-data folder, browser storage keys, and internal transport identifiers. Keeping these stable preserves existing conversations, preferences, drafts, and attachment links when replacing ClaudeX. Product names, repository URLs, and source checkout paths use ClaudeGPT/claudegpt.

### Conversation already has an active writer

Reading saved Codex history does not transfer its write ownership. If Codex reports that a thread already has an active writer, another Codex app-server/CLI process owns it; that client can retain ownership while idle. Finish any work there and quit that client before retrying in ClaudeGPT, or start a new conversation. ClaudeGPT keeps the unsent draft and does not force unlocks, stop another client, or silently fork the conversation.
