import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import path from 'node:path';

const base = process.env.CLAUDEX_TEST_URL || 'http://localhost:4317';
const service = path.resolve(import.meta.dirname, 'service.mjs');
const chatId = process.argv[2];
assert.ok(chatId, 'Pass an existing test conversation ID');
async function api(endpoint, body) {
  const r = await fetch(`${base}/api${endpoint}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', 'X-ClaudeGPT-Client': '1' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const d = await r.json(); if (!r.ok) throw new Error(d.error); return d;
}
async function finished() {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const s = await api('/state'), c = s.chats.find(c => c.id === chatId);
    if (c.status !== 'running') return c;
    await new Promise(resolve => setTimeout(resolve, 700));
  }
  throw new Error('Timed out waiting for the test turn');
}
const before = (await api('/state')).chats.find(c => c.id === chatId);
assert.ok(before && before.status !== 'running');
await promisify(execFile)(process.execPath, [service, 'stop']);
await new Promise(resolve => setTimeout(resolve, 500));
await promisify(execFile)(process.execPath, [service, 'start']);
await api('/reconnect', {});
const restored = (await api('/state')).chats.find(c => c.id === chatId);
assert.equal(restored.items.length, before.items.length, 'History persisted across server restart');
await api(`/chats/${chatId}/message`, { text: 'At the start of this conversation, you replied with a short connection confirmation. Repeat only that original sentence. Do not use tools.', effort: 'low' });
const resumed = await finished();
assert.equal(resumed.status, 'completed', resumed.error);
assert.match(resumed.items.filter(i => i.type === 'agentMessage').at(-1).text, /ClaudeGPT is connected\./);
await api(`/chats/${chatId}/message`, { text: 'Write a detailed tutorial explaining JavaScript, including examples of promises and async functions. Do not use any tools.', effort: 'medium' });
await api(`/chats/${chatId}/stop`, {});
const stopped = await finished();
assert.equal(stopped.status, 'interrupted');
console.log('PASS: detached production restart, history persistence, native Codex thread resume, and Stop response.');
