import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from './store.mjs';

test('saved history survives a restart and active turns become interrupted', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'claudex-store-'));
  try {
    const first = new Store(directory, '/tmp');
    first.state.chats.push({ id: 'chat', status: 'running', activeTurnId: 'turn', items: [{ id: 'message', type: 'agentMessage', text: 'A persisted reply' }] });
    first.state.settings.theme = 'light'; first.save();
    const restarted = new Store(directory, '/other');
    assert.equal(restarted.state.settings.theme, 'light');
    assert.equal(restarted.chat('chat').items[0].text, 'A persisted reply');
    assert.equal(restarted.chat('chat').status, 'interrupted');
    assert.equal(restarted.chat('chat').activeTurnId, null);
    assert.throws(() => restarted.chat('missing'), /could not be found/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('a malformed saved file is preserved before the store recovers', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'claudex-store-'));
  try {
    fs.writeFileSync(path.join(directory, 'state.json'), 'broken');
    const store = new Store(directory, '/tmp');
    assert.deepEqual(store.state.chats, []);
    const backup = fs.readdirSync(directory).find(file => file.startsWith('state.json.backup-'));
    assert.ok(backup);
    assert.equal(fs.readFileSync(path.join(directory, backup), 'utf8'), 'broken');
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(store.file, 'utf8')));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
