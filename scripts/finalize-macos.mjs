import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
if (process.platform === 'darwin') {
  const bundle = path.resolve(import.meta.dirname, '../src-tauri/target/release/bundle/macos/ClaudeX.app');
  // This is a local ad-hoc signature, not Developer ID signing or notarization.
  await promisify(execFile)('codesign', ['--force', '--deep', '--sign', '-', bundle]);
  await promisify(execFile)('codesign', ['--verify', '--deep', '--strict', bundle]);
  console.log(`Local Mac bundle verified: ${bundle}`);
}
