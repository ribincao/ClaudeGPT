import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const base = process.env.CLAUDEX_TEST_URL || 'http://localhost:4317';
async function api(endpoint, method = 'GET', body) {
  const result = await fetch(`${base}/api${endpoint}`, { method, headers: { 'Content-Type': 'application/json', 'X-ClaudeX-Client': '1' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await result.json(); if (!result.ok) throw new Error(data.error); return data;
}
const original = await api('/reconnect', 'POST');
const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'claudex-integration-'));
let chatId, approved = 0;
try {
  const foreign = await fetch(`${base}/api/settings`, { method: 'POST', headers: { Origin: 'https://example.org', 'Content-Type': 'application/json', 'X-ClaudeX-Client': '1' }, body: '{}' });
  assert.equal(foreign.status, 403);
  const noHeader = await fetch(`${base}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(noHeader.status, 403);
  await api('/workspaces', 'POST', { path: workspace });
  const safePath = (await api('/state')).settings.workspace;
  const outside = await fetch(`${base}/api/file?workspace=${encodeURIComponent(safePath)}&path=${encodeURIComponent('/etc/hosts')}`);
  assert.equal(outside.status, 400);
  const upload = await api('/uploads', 'POST', { name: 'context.md', type: 'text/markdown', data: Buffer.from('A small attachment.').toString('base64') });
  assert.ok(upload.id);
  const invalidUpload = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-ClaudeX-Client': '1' }, body: JSON.stringify({ name: 'document.pdf', type: 'application/pdf', data: 'AA==' }) });
  assert.equal(invalidUpload.status, 400);
  await api('/settings', 'POST', { approvalPolicy: 'untrusted', effort: 'low' });
  const chat = await api('/chats', 'POST', { workspace: safePath, mode: 'work' }); chatId = chat.id;
  await api(`/chats/${chatId}/message`, 'POST', { text: 'Use the shell to run python3 to create claudex-smoke.txt in the current workspace with exactly the text "ClaudeX file editing works." Then read that file and report its contents. Do not change any other files, use the network, or ask any questions. You may request command approval.' });
  const deadline = Date.now() + 120000;
  let complete = false;
  while (Date.now() < deadline) {
    const state = await api('/state');
    const chat = state.chats.find(c => c.id === chatId);
    for (const request of state.approvals.filter(a => a.params.threadId === chat.threadId)) {
      assert.equal(request.method, 'item/commandExecution/requestApproval', 'Only approve the expected local command');
      // The test only writes its temporary workspace. Never silently approve unrelated access.
      const command = request.params.command || '';
      assert.match(command, /python|claudex-smoke|cat/);
      await api(`/approvals/${request.id}`, 'POST', { decision: 'accept' }); approved++;
    }
    if (['completed', 'failed', 'interrupted'].includes(chat.status)) {
      assert.equal(chat.status, 'completed', chat.error || 'The work turn did not complete');
      assert.equal(chat.items.filter(i => i.type === 'userMessage').length, 1);
      complete = true; break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(complete, 'The work turn completed before timeout');
  assert.equal((await fs.readFile(path.join(safePath, 'claudex-smoke.txt'), 'utf8')).trim(), 'ClaudeX file editing works.');
  console.log(`PASS: loopback origin protection, required request header, scoped file access, text uploads, unsupported upload errors, and real Codex file editing (${approved} approval requests handled).`);
  console.log(`Work chat: ${chatId}`);
} finally {
  await api('/settings', 'POST', original.settings);
  if (chatId && process.env.CLAUDEX_KEEP_TEST_CHAT !== '1') {
    const state = await api('/state');
    const chat = state.chats.find(c => c.id === chatId);
    if (chat?.status === 'running') await api(`/chats/${chatId}/stop`, 'POST');
    else if (chat) await api(`/chats/${chatId}`, 'DELETE');
  }
  // Leave the folder during an in-progress test rather than deleting its live workspace.
  const state = await api('/state');
  if (!state.chats.some(c => c.id === chatId && c.status === 'running')) await fs.rm(workspace, { recursive: true, force: true });
}
