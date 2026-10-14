# Release plan

CI is deferred until the owner accepts the first local Mac build. No workflow is enabled in this version.

After acceptance, use a manually dispatched/tag-triggered Tauri workflow with macOS ARM64, macOS Intel, and Windows x64 runners. Use Node/Rust setup, caches, locked installs, frontend checks, Rust tests, and tauri build on the matching platform. Reference: claude-pet and Tauri's official GitHub pipeline documentation.

Upload binaries to GitHub Release assets or CI artifacts, never Git history. Decide signing/notarization before public distribution. Publish draft releases first, record checksums and platform limits, and add direct download links only after real assets exist.

The first local app is src-tauri/target/release/bundle/macos/ClaudeX.app. It is not a published release.
