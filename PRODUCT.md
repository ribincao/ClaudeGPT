# ClaudeX

<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
React requested by the user. Local Node server connects to the installed Codex app-server. A native Mac version follows only after the user evaluates the web version.

## Users
The workspace owner, using a Mac and seeking a lighter, calmer interface to Codex.

## Product Purpose
A complete locally runnable web client for Codex that the owner can evaluate tomorrow morning.

## Operating Context
The installed Codex CLI is signed in with ChatGPT. The app runs on this Mac and operates in user-selected local workspaces.

## Capabilities and Constraints
Real streaming conversations, saved conversation history, model and reasoning selection, command and file-change approvals, workspace choice, clean persistent settings. Local-only is an implementation assumption chosen to preserve access to local Codex and files. No public hosting or separate API key is necessary for this first version.

## Brand Commitments
Name: ClaudeX. Follow the supplied Claude Desktop screenshots: dark quiet surfaces, generous spacing, understated sidebar, serif greeting, settings overlay with plain aligned rows. Orange favicon with a white ChatGPT knot symbol. User explicitly asks to proceed while they sleep; do not block on interviews or visual choices.

## Evidence on Hand
Reference screenshots in `.impeccable/references/claude-home.png` and `claude-settings.png`. No invented conversations, usage figures, or benchmarks.

## Product Principles
- Keep the conversation central.
- Show advanced details when needed.
- Make all visible controls work.
- Retain local history and preferences across restarts.
- Make errors recoverable and approvals explicit.

## Desktop evolution
The user approved the existing style and requested a Tauri/Rust app, macOS-first with Windows support in the source. The public standalone repository is ribincao/ClaudeX under MIT. CI/release automation is explicitly deferred until local evaluation. React stays shared under web/. Native backend state stays in OS application data; Node is preview-only. Custom avatars and pets are future additions.
