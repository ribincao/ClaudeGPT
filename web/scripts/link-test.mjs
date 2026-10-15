import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base = process.env.CLAUDEX_TEST_URL || 'http://localhost:4317';
const state = await (await fetch(`${base}/api/state`)).json();
state.projects = [];
state.chats = [{ id: 'link-test', title: 'Links', workspace: '/tmp', mode: 'work', createdAt: 1, updatedAt: 1, status: 'idle', archived: false, items: [{ id: 'reply', type: 'agentMessage', text: '[Website](https://example.com/docs?q=hello#section) · [Email](mailto:test@example.com) · [Local file](./README.md) · [Failure](https://example.com/fail)' }] }];
const capabilities = JSON.parse(await fs.readFile(new URL('../../src-tauri/capabilities/default.json', import.meta.url)));
assert.ok(capabilities.permissions.includes('opener:allow-open-url'));
assert.ok(capabilities.permissions.includes('opener:allow-default-urls'), 'Native opener must authorize standard URL schemes');
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
 const page = await browser.newPage();
 await page.addInitScript(state => {
  window.isTauri = true;
  window.linkCalls = [];
  localStorage.setItem('claudex-active', 'link-test');
  window.__TAURI_INTERNALS__ = {
   transformCallback: () => 1,
   invoke: async (command, args) => {
    window.linkCalls.push({ command, args });
    if (command === 'request') {
     if (args.path === '/state' || args.path === '/history/refresh') return state;
     if (args.path.startsWith('/chats/')) return state.chats[0];
     return { entries: [], content: 'Local preview', path: 'README.md', name: 'README.md' };
    }
    if (command === 'plugin:opener|open_url' && args.url.endsWith('/fail')) throw new Error('Simulated OS opener failure');
    return 1;
   }
  };
 }, state);
 await page.goto(base);
 await page.getByRole('link', { name: 'Website', exact: true }).click();
 let opened = await page.evaluate(() => window.linkCalls.filter(c => c.command === 'plugin:opener|open_url').map(c => c.args.url));
 assert.deepEqual(opened, ['https://example.com/docs?q=hello#section']);
 await page.getByRole('link', { name: 'Email', exact: true }).focus();
 await page.keyboard.press('Enter');
 opened = await page.evaluate(() => window.linkCalls.filter(c => c.command === 'plugin:opener|open_url').map(c => c.args.url));
 assert.equal(opened.at(-1), 'mailto:test@example.com');
 assert.equal(page.url(), `${base}/`, 'External links must not navigate the app');
 assert.equal(await page.getByRole('button', { name: 'Local file', exact: true }).count(), 1);
 await page.getByRole('link', { name: 'Failure', exact: true }).click();
 await page.getByRole('status').filter({ hasText: 'Could not open the link' }).waitFor();
 console.log('PASS: native URL permission scope, exact URL dispatch, keyboard activation, local-file routing, and visible opener errors (mocked desktop IPC).');
} finally { await browser.close(); }
