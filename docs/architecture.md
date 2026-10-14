# Architecture

One React interface has two transports:

```text
Desktop: React → Tauri IPC → Rust backend → Codex app-server (JSONL stdio)
Preview: React → local HTTP/WebSocket → Node preview → Codex app-server
```

The desktop has no HTTP listener or Node sidecar. It uses native IPC, dialogs, clipboard integration, and a restricted custom image scheme. The Codex child is stopped on app exit. Single-instance handling avoids competing writers.

`web/src/api.ts` centralizes requests, subscriptions, downloads, clipboard, and external links. Rust `routes.rs` handles actions; `engine.rs` manages child-process RPC; `store.rs` owns persistence and workspace boundaries; `lib.rs` reduces events and emits stream deltas.

State saves on important mutations, periodically during streaming, and on exit. Mac saves use atomic rename. Windows preserves a previous-state backup when replacing state. Unfinished responses recover as interrupted. Saved Codex thread IDs support thread/resume.

Future avatars and pets belong outside the engine bridge. Public hosted services are outside this local-client design and would need separate authentication and isolation.

## Codex as the conversation source

Desktop startup and reconnect list all pages of saved interactive local Codex threads, including archived threads. The UI cache preserves local pins and in-progress responses, but thread IDs and transcript history come from Codex. Selecting a conversation reads its saved turns; paginated histories use full turn pages. Window focus and periodic refresh reconcile metadata. Rename, archive, restore, and delete call the original thread protocol. Existing imported threads resume without replacing their stored developer instructions. ChatGPT authentication is handled by Codex, and credentials are never copied into ClaudeX state.
