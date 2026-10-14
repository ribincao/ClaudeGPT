import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const directory = path.join(root, '../.data');
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
const pidFile = path.join(directory, 'server.pid');
const entry = path.join(root, 'server/index.mjs');
const address = `http://localhost:${process.env.CLAUDEX_PORT || 4317}`;
async function healthy() { try { const response = await fetch(`${address}/api/health`, { signal: AbortSignal.timeout(1200) }); const data = await response.json(); return data.app === 'ClaudeX' && data.ok; } catch { return false; } }
const command = process.argv[2] || 'start';
if (command === 'stop') {
  if (!fs.existsSync(pidFile)) { console.log('No ClaudeX background server is recorded.'); process.exit(0); }
  const pid = Number(fs.readFileSync(pidFile, 'utf8'));
  if (Number.isSafeInteger(pid) && pid > 1) {
    try {
      const { stdout } = await promisify(execFile)('ps', ['-p', String(pid), '-o', 'command=']);
      if (stdout.includes(entry)) { process.kill(pid, 'SIGTERM'); console.log('ClaudeX stopped.'); }
      else console.log('The recorded process is no longer ClaudeX; it was left untouched.');
    } catch { console.log('ClaudeX is already stopped.'); }
  }
  fs.rmSync(pidFile, { force: true });
} else if (command === 'status') {
  console.log(await healthy() ? `ClaudeX is running at ${address}` : 'ClaudeX is stopped.');
} else if (command === 'start') {
  if (await healthy()) { console.log(`ClaudeX is already running at ${address}`); process.exit(0); }
  if (!fs.existsSync(path.join(root, 'dist/index.html'))) { console.error('Build ClaudeX first with npm run build.'); process.exit(1); }
  const log = fs.openSync(path.join(directory, 'server.log'), 'a', 0o600);
  const child = spawn(process.execPath, [entry], { cwd: root, env: process.env, detached: true, stdio: ['ignore', log, log] });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.unref(); fs.closeSync(log);
  fs.writeFileSync(pidFile, String(child.pid), { mode: 0o600 });
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 200));
    if (await healthy()) { console.log(`ClaudeX is ready at ${address}`); process.exit(0); }
  }
  console.error('ClaudeX did not start. Check .data/server.log.'); process.exitCode = 1;
} else { console.error('Usage: node scripts/service.mjs start|stop|status'); process.exitCode = 1; }
