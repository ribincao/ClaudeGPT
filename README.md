<p align="center"><img src="web/public/favicon.svg" width="80" alt="ClaudeX icon"></p>
<h1 align="center">ClaudeX</h1>
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

[GitHub Releases](https://github.com/ribincao/ClaudeX/releases) will hold downloadable Mac and Windows installers. **No public release has been published yet.** The first version is being evaluated locally before build CI and release automation are enabled.

When a release is available, download the installer for your platform, launch ClaudeX, and connect your installed Codex. Each release will document signing and platform requirements. This first local build is not a signed public distribution.

## Requirements

Install a current Codex CLI and sign in with your supported ChatGPT plan or API credentials. ClaudeX reuses Codex's own authentication; credentials never enter the React interface. On macOS it prefers the current Codex engine bundled with an installed ChatGPT desktop app. On Windows it checks PATH and the standard global npm installation. **Settings → Account** lets you choose an executable manually.

Codex is an external prerequisite, not vendored by this project. Model availability, inference billing, and limits remain those of your account.

## Run and build

Install [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), stable Rust, and Node.js 22+. macOS requires Xcode Command Line Tools. Windows requires Microsoft C++ build tools and WebView2.

```sh
git clone https://github.com/ribincao/ClaudeX.git
cd ClaudeX
npm ci
npm run dev
```

Build a local Mac application for evaluation (the build applies and verifies an ad-hoc local signature):

```sh
npm run build
open src-tauri/target/release/bundle/macos/ClaudeX.app
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

Desktop history and attachments live in the operating system's application-data directory (`~/Library/Application Support/io.github.ribincao.claudex` on macOS). The preview uses separate, ignored `.data/` state. Prompts and selected context go to OpenAI through Codex during inference.

Chat requests read-only access. Work permits writes inside the chosen workspace; Codex can request additional approval. Grants are scoped to the current turn. Review important changes. Clearing ClaudeX history does not delete Codex's own session logs or uploaded files.

## First-version scope

The core workflow is implemented. Custom avatars, pets, voice, PDF/Word ingestion, cloud sync, and external MCP form completion are future features. Unsupported forms can be declined. Other Codex clients' history is not imported automatically.

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

[MIT](LICENSE) © 2026 Ribin Cao. ClaudeX is a personal, noncommercial hobby project; MIT permits modification, redistribution, and commercial reuse by others.

ClaudeX is independent and unaffiliated with Anthropic or OpenAI. Claude Desktop inspired the visual style; Codex provides the assistant engine. The orange-and-white icon derives from the OpenAI knot in [Simple Icons v11](https://cdn.jsdelivr.net/npm/simple-icons@11/icons/openai.svg). Third-party marks remain their owners' property. See [notices](THIRD_PARTY_NOTICES.md).
