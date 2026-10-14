# Development

Use Node.js 22+, stable Rust, and Tauri's platform prerequisites. Commit package-lock.json and Cargo.lock; use locked dependencies for reproducible packaging.

- `npm run dev`: desktop hot reload.
- `npm run dev:web`: browser preview and its Node backend.
- `npm run build:web`: frontend type check and build.
- `npm run build`: local Mac .app evaluation build.
- `npm run build:desktop`: platform installers.
- `npm run test:rust`: persistence and workspace-boundary tests.

Use CLAUDEX_CODEX_BIN to override automatic engine discovery, or select an executable in Account settings. Browser tests accept CLAUDEX_TEST_CHROME for the installed Chrome executable.

Never commit .data/, application-data state, .env, logs, captures, node_modules/, web/dist/, or src-tauri/target/. These are ignored. Lockfiles and small icon inputs are intentional source files. Test Windows dialogs and path handling on Windows before claiming release readiness.
