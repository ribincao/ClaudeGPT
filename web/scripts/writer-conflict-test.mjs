import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = process.env.CLAUDEX_TEST_URL || 'http://localhost:4317';
const state = await (await fetch(`${base}/api/state`)).json();
state.chats = [{ id: 'writer-fixture', threadId: 'original-thread', title: 'Shared conversation', workspace: '/tmp', mode: 'work', items: [], status: 'idle', createdAt: 1, updatedAt: 1, archived: false }];
state.projects = [];
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
 const page = await browser.newPage();
 await page.addInitScript(state => {
  window.isTauri = true;
  window.writerCalls = [];
  localStorage.setItem('claudex-active', 'writer-fixture');
  localStorage.removeItem('claudex-drafts');
  window.__TAURI_INTERNALS__ = { transformCallback: () => 1, invoke: async (command, args) => {
   window.writerCalls.push({ command, args });
   if (command === 'request') {
    if (args.path.endsWith('/message')) throw new Error('Another Codex client owns this conversation, even if it is idle. Use New chat, or finish its work and quit that client before retrying. Your draft has been kept.');
    if (args.path === '/state' || args.path === '/history/refresh') return state;
    if (args.path.startsWith('/chats/')) return state.chats[0];
   }
   return 1;
  }};
 }, state);
 await page.goto(base);
 const input = page.getByRole('textbox', { name: 'Message Codex' });
 await input.fill('Keep this unsent prompt.');
 await page.getByRole('button', { name: 'Send message', exact: true }).click();
 await page.getByRole('status').filter({ hasText: 'Another Codex client owns this conversation' }).waitFor();
 assert.equal(await input.inputValue(), 'Keep this unsent prompt.');
 assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('claudex-drafts'))['writer-fixture']), 'Keep this unsent prompt.');
 const calls = await page.evaluate(() => window.writerCalls);
 assert.equal(calls.filter(c => c.command === 'request' && c.args.path === '/chats/writer-fixture/message').length, 1);
 assert.equal(calls.some(c => c.args?.path === '/chats' || c.args?.path?.includes('/fork')), false);
 console.log('PASS: writer conflict retains the original draft and conversation; no automatic new thread or fork (mocked desktop IPC).');
} finally { await browser.close(); }
