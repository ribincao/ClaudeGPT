import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const base = process.env.CLAUDEX_TEST_URL || 'http://localhost:4317';
const root = path.resolve(import.meta.dirname, '../..');
const screenshots = path.join(root, '.impeccable/review');
await fs.mkdir(screenshots, { recursive: true });
const request = async (endpoint, method = 'GET', body) => {
  const result = await fetch(`${base}/api${endpoint}`, { method, headers: { 'Content-Type': 'application/json', 'X-ClaudeGPT-Client': '1' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await result.json(); if (!result.ok) throw new Error(data.error); return data;
};
const original = await request('/reconnect', 'POST');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CLAUDEX_TEST_CHROME || chrome });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let chatId;
async function screenshot(name) {
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  await page.screenshot({ path: path.join(screenshots, name), fullPage: true, animations: 'disabled' });
}
try {
  await page.goto(base);
  await page.getByRole('heading', { level: 1 }).waitFor();
  assert.match(await page.title(), /ClaudeGPT/);
  await page.getByRole('button', { name: 'Write', exact: true }).click();
  assert.equal(await page.getByRole('textbox', { name: 'Message Codex' }).inputValue(), 'Help me write ');
  await page.getByRole('textbox', { name: 'Message Codex' }).fill('A saved draft');
  await page.reload();
  await page.getByRole('textbox', { name: 'Message Codex' }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Message Codex' }).inputValue(), 'A saved draft');
  await page.getByRole('textbox', { name: 'Message Codex' }).fill('');
  await screenshot('desktop.png');

  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  await page.getByRole('heading', { name: 'Appearance' }).waitFor();
  await screenshot('settings-desktop.png');
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  assert.equal((await request('/state')).settings.theme, 'light');
  await screenshot('settings-light.png');
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.getByRole('textbox', { name: 'Search settings' }).fill('reasoning');
  await page.getByRole('heading', { name: 'Model & reasoning' }).waitFor();
  assert.ok(await page.getByRole('combobox', { name: 'Default model' }).locator('option').count() > 0);
  await page.getByRole('textbox', { name: 'Search settings' }).fill('');
  await page.getByRole('button', { name: 'Close Settings' }).click();

  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByLabel('Or use another folder').fill('/a-folder-that-does-not-exist-claudex');
  await page.getByRole('button', { name: 'Use folder', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'does not exist' }).waitFor();
  await page.getByRole('button', { name: 'Close Choose workspace', exact: true }).click();

  await page.getByRole('button', { name: 'Skills', exact: true }).click();
  await page.getByRole('dialog', { name: 'Choose a skill' }).waitFor();
  await page.getByRole('textbox', { name: 'Search skills' }).fill('a-skill-that-is-not-installed-claudex');
  await page.getByText('No matching skills. Try another search.').waitFor({ timeout: 45000 });
  await page.getByRole('button', { name: 'Close Choose a skill' }).click();

  if (process.env.CLAUDEX_LIVE_TEST === '1') {
    await request('/settings', 'POST', { workspace: root, effort: 'low' });
    const prompt = 'Reply with exactly: ClaudeGPT is connected. Do not use tools or modify files.';
    await page.getByRole('textbox', { name: 'Message Codex' }).fill(prompt);
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await page.locator('.assistant-message').filter({ hasText: 'ClaudeGPT is connected.' }).waitFor({ timeout: 90000 });
    await page.waitForFunction(() => !document.querySelector('.thinking'), { timeout: 90000 });
    const snapshot = await request('/state');
    const chat = snapshot.chats.find(c => c.title.startsWith('Reply with exactly: ClaudeGPT'));
    chatId = chat.id;
    assert.equal(chat.status, 'completed');
    assert.equal(chat.items.filter(i => i.type === 'userMessage').length, 1, 'No duplicate user messages');
    assert.equal(chat.items.filter(i => i.type === 'agentMessage').at(-1).text, 'ClaudeGPT is connected.');
    await screenshot('conversation-desktop.png');
    await page.reload();
    await page.locator('.assistant-message').filter({ hasText: 'ClaudeGPT is connected.' }).waitFor();
    await page.getByRole('button', { name: 'Files', exact: true }).click();
    await page.getByRole('button', { name: 'package.json', exact: true }).click();
    await page.locator('.file-preview').filter({ hasText: 'claudex' }).waitFor();
    await page.getByRole('button', { name: 'Mention in message' }).click();
    assert.match(await page.getByRole('textbox', { name: 'Message Codex' }).inputValue(), /package.json/);
    await page.getByRole('button', { name: 'Close files' }).click();
    await page.getByRole('button', { name: /^Search chats/ }).click();
    await page.getByRole('textbox', { name: 'Search conversations', exact: true }).fill('ClaudeGPT is connected');
    assert.ok(await page.locator('.search-results > button').count() >= 1);
    await page.getByRole('button', { name: 'Close Search conversations' }).click();
  }

  await page.getByRole('button', { name: /^New chat/ }).click();
  await page.getByRole('textbox', { name: 'Message Codex' }).fill('');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole('heading', { level: 1 }).waitFor();
  await screenshot('mobile.png');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No mobile horizontal overflow');
  await page.getByRole('button', { name: 'Open sidebar' }).click();
  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  await screenshot('settings-mobile.png');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Settings fit mobile width');
  assert.deepEqual(errors, [], 'No browser runtime errors');
  console.log('PASS: home, persistent draft, settings, theme persistence, settings search, workspace errors, skills search, responsive layout, and browser runtime checks.');
  if (chatId) console.log(`PASS: live streaming, conversation reload, single user message, file previews, and conversation search. Chat: ${chatId}`);
} finally {
  await request('/settings', 'POST', original.settings);
  if (chatId && process.env.CLAUDEX_KEEP_TEST_CHAT !== '1') await request(`/chats/${chatId}`, 'DELETE');
  await browser.close();
}
