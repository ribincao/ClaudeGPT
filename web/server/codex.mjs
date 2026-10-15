import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';

export class CodexBridge extends EventEmitter {
  constructor() {
    super(); this.sequence = 0; this.pending = new Map(); this.ready = false; this.resumed = new Set();
  }
  async start() {
    if (this.starting) return this.starting;
    this.starting = this.connect().catch(error => { this.starting = null; throw error; });
    return this.starting;
  }
  async connect() {
    // Prefer the current desktop-bundled engine; Homebrew's CLI can lag behind
    // the account's model catalog. This does not change the user's global CLI.
    const bundled = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex';
    const binary = process.env.CLAUDEX_CODEX_BIN || (existsSync(bundled) ? bundled : 'codex');
    this.process = spawn(binary, ['app-server', '--listen', 'stdio://'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.process.on('error', e => this.disconnected(e));
    this.process.on('exit', code => this.disconnected(new Error(`Codex stopped (${code ?? 'signal'}). Reconnect in Settings.`)));
    this.process.stderr.on('data', data => {
      // Never expose credentials or raw diagnostics to the browser.
      const message = data.toString();
      if (/error|failed/i.test(message)) this.lastDiagnostic = message.slice(-1500);
    });
    createInterface({ input: this.process.stdout }).on('line', line => {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      if (message.method) this.emit(message.id === undefined ? 'notification' : 'request', message);
      else if (this.pending.has(message.id)) {
        const pending = this.pending.get(message.id); clearTimeout(pending.timer); this.pending.delete(message.id);
        message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
      }
    });
    await this.call('initialize', { clientInfo: { name: 'claudex_local', title: 'ClaudeGPT', version: '0.1.0' }, capabilities: { experimentalApi: true } });
    this.send({ method: 'initialized', params: {} }); this.ready = true;
    this.emit('ready');
  }
  disconnected(error) {
    this.ready = false; this.starting = null; this.resumed.clear();
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear(); this.emit('disconnected', error);
  }
  send(message) {
    if (!this.process?.stdin.writable) throw new Error('Codex is disconnected. Open Settings → Account to reconnect.');
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }
  call(method, params = {}, timeout = 45000) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex took too long to respond to ${method}. Try again.`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ id, method, params }); } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  reply(id, result) { this.send({ id, result }); }
  stop() { this.process?.kill(); }
}
