import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import { Store, defaultSettings } from './store.mjs';
import { CodexBridge } from './codex.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.CLAUDEX_PORT || 4317);
const dataDir = process.env.CLAUDEX_DATA_DIR || path.join(root, '../.data');
const store = new Store(dataDir, process.env.CLAUDEX_WORKSPACE || os.homedir());
const bridge = new CodexBridge();
const approvals = new Map();
let account = null, models = [], engineError = null;
function errorMessage(value) {
  if (typeof value !== 'string') return 'Codex encountered an error. Please try again.';
  try { const parsed = JSON.parse(value); return parsed.error?.message || parsed.message || value; } catch { return value; }
}
const app = express(), server = createServer(app);
const sockets = new WebSocketServer({ noServer: true });
const allowedHosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
const validOrigin = origin => origin && [`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(origin);

app.disable('x-powered-by');
app.use((req, res, next) => {
  if (!allowedHosts.has(req.headers.host)) return res.status(403).json({ error: 'ClaudeX accepts local connections only.' });
  if (req.headers.origin && !validOrigin(req.headers.origin)) return res.status(403).json({ error: 'Cross-origin requests are disabled.' });
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers['x-claudex-client'] !== '1') return res.status(403).json({ error: 'Missing local client header.' });
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
app.use(express.json({ limit: '16mb' }));

const snapshot = () => ({ ...store.state, account, models, connected: bridge.ready, engineError, approvals: [...approvals.values()].map(a => ({ ...a, id: String(a.id) })) });
function broadcast(event) {
  const data = JSON.stringify(event);
  for (const socket of sockets.clients) if (socket.readyState === WebSocket.OPEN && socket.bufferedAmount < 4_000_000) socket.send(data);
}
function changed(chat) { store.schedule(); broadcast({ type: 'chat', chat }); }
function notifyState() { broadcast({ type: 'state', state: snapshot() }); }
server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/events' || !allowedHosts.has(req.headers.host) || !validOrigin(req.headers.origin)) return socket.destroy();
  sockets.handleUpgrade(req, socket, head, ws => sockets.emit('connection', ws, req));
});
sockets.on('connection', socket => socket.send(JSON.stringify({ type: 'state', state: snapshot() })));

async function ready() { await bridge.start(); if (!bridge.ready) throw new Error('Codex is not ready yet.'); }
async function refreshEngine() {
  await ready();
  const results = await Promise.allSettled([bridge.call('account/read', {}), bridge.call('model/list', { limit: 100 })]);
  if (results[0].status === 'fulfilled') account = results[0].value.account;
  if (results[1].status === 'fulfilled') {
    models = results[1].value.data;
    if (!models.some(m => m.id === store.state.settings.model || m.model === store.state.settings.model)) {
      const model = models.find(m => m.isDefault) || models[0];
      if (model) store.state.settings.model = model.model || model.id;
    }
  }
  engineError = results.filter(r => r.status === 'rejected').map(r => r.reason.message).join('\n') || null;
  store.save(); notifyState(); return snapshot();
}
bridge.on('disconnected', error => {
  engineError = error.message;
  approvals.clear();
  for (const chat of store.state.chats) if (chat.status === 'running') {
    chat.status = 'interrupted'; chat.error = 'The Codex connection ended. Reconnect in Settings, then send another message.'; chat.activeTurnId = null;
  }
  store.save(); notifyState();
});

bridge.on('notification', ({ method, params: p }) => {
  if (method === 'account/updated') { bridge.call('account/read', {}).then(r => { account = r.account; notifyState(); }).catch(() => {}); return; }
  if (method === 'account/login/completed') { broadcast({ type: 'login', ...p }); refreshEngine().catch(() => {}); return; }
  const chat = store.state.chats.find(c => c.threadId === p?.threadId);
  if (!chat) return;
  if (method === 'turn/started') { chat.status = 'running'; chat.activeTurnId = p.turn.id; chat.error = null; }
  if (method === 'item/started' || method === 'item/completed') {
    const item = { ...p.item, turnId: p.turnId };
    let index = chat.items.findIndex(i => i.id === item.id);
    if (item.type === 'userMessage') {
      if (index < 0) index = chat.items.findIndex(i => i.clientPending);
      if (index >= 0) {
        const displayed = chat.items[index];
        item.content = displayed.content;
        item.attachments = displayed.attachments;
        item.clientPending = false;
      }
    }
    if (index < 0) chat.items.push(item); else chat.items[index] = { ...chat.items[index], ...item };
  }
  if (method === 'item/agentMessage/delta') {
    let item = chat.items.find(i => i.id === p.itemId);
    if (!item) { item = { id: p.itemId, type: 'agentMessage', text: '', turnId: p.turnId }; chat.items.push(item); }
    item.text += p.delta;
    store.schedule(); broadcast({ type: 'delta', chatId: chat.id, itemId: p.itemId, delta: p.delta, turnId: p.turnId }); return;
  }
  if (method === 'item/commandExecution/outputDelta') {
    const item = chat.items.find(i => i.id === p.itemId);
    if (item) item.aggregatedOutput = ((item.aggregatedOutput || '') + p.delta).slice(-100000);
  }
  if (method === 'thread/tokenUsage/updated') chat.tokenUsage = p.tokenUsage;
  if (method === 'turn/plan/updated') chat.plan = p.plan;
  if (method === 'error') { chat.error = errorMessage(p.error?.message || p.message); }
  if (method === 'turn/completed') {
    chat.status = p.turn.status; chat.activeTurnId = null;
    if (p.turn.error) chat.error = errorMessage(p.turn.error.message);
    for (const [id, approval] of approvals) if (approval.params.threadId === chat.threadId) approvals.delete(id);
    store.save(); notifyState(); return;
  }
  if (['turn/started', 'item/started', 'item/completed', 'item/commandExecution/outputDelta', 'thread/tokenUsage/updated', 'turn/plan/updated', 'error'].includes(method)) changed(chat);
});

bridge.on('request', request => {
  const supported = ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval', 'item/tool/requestUserInput', 'item/permissions/requestApproval', 'mcpServer/elicitation/request'];
  if (!supported.includes(request.method)) {
    bridge.send({ id: request.id, error: { code: -32601, message: 'ClaudeX does not support this interactive request yet.' } }); return;
  }
  approvals.set(String(request.id), request); notifyState();
});

function wrap(handler) { return (req, res, next) => Promise.resolve(handler(req, res)).catch(next); }
app.get('/api/state', (_, res) => res.json(snapshot()));
app.get('/api/health', (_, res) => res.json({ ok: true, codex: bridge.ready, app: 'ClaudeX' }));
app.post('/api/reconnect', wrap(async (_, res) => res.json(await refreshEngine())));
app.post('/api/login', wrap(async (_, res) => { await ready(); res.json(await bridge.call('account/login/start', { type: 'chatgpt' })); }));
app.post('/api/login/cancel', wrap(async (req, res) => { await bridge.call('account/login/cancel', { loginId: req.body.loginId }); res.json({ ok: true }); }));
app.post('/api/settings', wrap(async (req, res) => {
  const input = req.body;
  for (const key of Object.keys(defaultSettings)) if (key in input) {
    if (typeof input[key] !== typeof defaultSettings[key]) throw new Error(`Invalid value for ${key}.`);
  }
  const enums = { theme: ['dark', 'light', 'system'], font: ['serif', 'sans'], textSize: ['small', 'medium', 'large'], width: ['narrow', 'medium', 'wide'], approvalPolicy: ['on-request', 'untrusted'], effort: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'] };
  for (const [key, values] of Object.entries(enums)) if (key in input && !values.includes(input[key])) throw new Error(`Invalid ${key}.`);
  if (input.model && models.length && !models.some(model => (model.model || model.id) === input.model)) throw new Error('This model is no longer available. Choose one from the Codex model selector.');
  if (input.workspace) input.workspace = await validateDirectory(input.workspace);
  store.state.settings = { ...store.state.settings, ...Object.fromEntries(Object.keys(defaultSettings).filter(k => k in input).map(k => [k, input[k]])) };
  store.save(); notifyState(); res.json(store.state.settings);
}));

async function validateDirectory(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Enter a folder path.');
  const normalized = path.resolve(value.replace(/^~(?=\/|$)/, os.homedir()));
  const resolved = await fs.realpath(normalized).catch(() => { throw new Error('That folder does not exist. Check the path and try again.'); });
  if (!(await fs.stat(resolved)).isDirectory()) throw new Error('Choose a folder, not a file.');
  return resolved;
}
app.post('/api/workspaces', wrap(async (req, res) => {
  const directory = await validateDirectory(req.body.path);
  if (!store.state.workspaces.includes(directory)) store.state.workspaces.push(directory);
  store.state.settings.workspace = directory; store.save(); notifyState(); res.json({ path: directory });
}));
app.post('/api/workspaces/choose', wrap(async (_, res) => {
  if (process.platform !== 'darwin') throw new Error('The native folder picker is available on Mac. Paste a folder path instead.');
  try {
    const { stdout } = await promisify(execFile)('osascript', ['-e', 'POSIX path of (choose folder with prompt "Choose a workspace for ClaudeX")'], { timeout: 120000 });
    const directory = await validateDirectory(stdout.trim());
    if (!store.state.workspaces.includes(directory)) store.state.workspaces.push(directory);
    store.state.settings.workspace = directory; store.save(); notifyState(); res.json({ path: directory });
  } catch (error) { if (String(error.stderr || '').includes('-128')) return res.json({ canceled: true }); throw error; }
}));

app.post('/api/chats', wrap(async (req, res) => {
  const cwd = await validateDirectory(req.body.workspace || store.state.settings.workspace);
  const chat = { id: randomUUID(), title: 'New conversation', createdAt: Date.now(), updatedAt: Date.now(), workspace: cwd, mode: req.body.mode === 'work' ? 'work' : 'chat', items: [], status: 'idle', threadId: null, activeTurnId: null, pinned: false, archived: false };
  store.state.chats.unshift(chat); store.save(); notifyState(); res.json(chat);
}));
app.patch('/api/chats/:id', wrap(async (req, res) => {
  const chat = store.chat(req.params.id);
  if ('title' in req.body) { const title = String(req.body.title).trim().slice(0, 120); if (!title) throw new Error('Give this conversation a name.'); chat.title = title; }
  for (const key of ['pinned', 'archived']) if (typeof req.body[key] === 'boolean') chat[key] = req.body[key];
  store.save(); notifyState(); res.json(chat);
}));
app.delete('/api/chats/:id', wrap(async (req, res) => {
  const chat = store.chat(req.params.id);
  if (chat.status === 'running') throw new Error('Stop the response before deleting this conversation.');
  store.state.chats = store.state.chats.filter(c => c.id !== chat.id); store.save(); notifyState(); res.json({ ok: true });
}));

app.post('/api/chats/:id/message', wrap(async (req, res) => {
  const chat = store.chat(req.params.id);
  if (chat.status === 'running') throw new Error('Wait for the response or press Stop before sending another message.');
  const text = String(req.body.text || '').trim();
  const attachments = Array.isArray(req.body.attachments) ? req.body.attachments : [];
  if (!text && !attachments.length) throw new Error('Write a message or attach a file first.');
  if (text.length > 200000) throw new Error('This message is too long. Attach a text file instead.');
  const input = [{ type: 'text', text: text || 'Please review the attached files.' }];
  const safeAttachments = [];
  for (const attachment of attachments.slice(0, 8)) {
    const file = await resolveUpload(attachment.id);
    safeAttachments.push({ id: file.id, name: file.name, type: file.type });
    if (file.type.startsWith('image/')) input.push({ type: 'localImage', path: file.path });
    else input.push({ type: 'text', text: `Attached file: ${file.name}\n\n${await fs.readFile(file.path, 'utf8')}` });
  }
  await ready();
  if (req.body.skill) {
    const response = await bridge.call('skills/list', { cwds: [chat.workspace] });
    const skill = response.data?.flatMap(d => d.skills || []).find(s => s.path === req.body.skill.path && s.enabled !== false);
    if (!skill) throw new Error('This skill is no longer available. Refresh the skill list.');
    input.push({ type: 'skill', name: skill.name, path: skill.path });
  }
  const settings = store.state.settings;
  const chosenModel = models.find(m => (m.model || m.id) === (req.body.model || settings.model));
  if (!chosenModel) throw new Error('Choose an available model in Settings → Codex.');
  const requestedEffort = req.body.effort || settings.effort;
  const efforts = (chosenModel.supportedReasoningEfforts || []).map(e => e.reasoningEffort);
  const effort = efforts.includes(requestedEffort) ? requestedEffort : chosenModel.defaultReasoningEffort;
  const sandbox = chat.mode === 'work' ? 'workspace-write' : 'read-only';
  const instructions = ['You are the assistant in ClaudeX, a personal local Codex client. Keep explanations clear and concise. Use Markdown when helpful.', settings.customInstructions].filter(Boolean).join('\n\n');
  const config = { cwd: chat.workspace, model: chosenModel.model || chosenModel.id, sandbox, approvalPolicy: settings.approvalPolicy, approvalsReviewer: 'user', developerInstructions: instructions };
  if (!chat.threadId) {
    const result = await bridge.call('thread/start', config);
    chat.threadId = result.thread.id; bridge.resumed.add(chat.threadId);
  } else if (!bridge.resumed.has(chat.threadId)) {
    await bridge.call('thread/resume', { threadId: chat.threadId, excludeTurns: true, ...config }); bridge.resumed.add(chat.threadId);
  }
  const message = { id: randomUUID(), type: 'userMessage', clientPending: true, content: [{ type: 'text', text }], attachments: safeAttachments };
  chat.items.push(message); chat.status = 'running'; chat.error = null; chat.updatedAt = Date.now();
  if (chat.title === 'New conversation') chat.title = (text || safeAttachments[0]?.name || 'New conversation').replace(/\s+/g, ' ').slice(0, 60);
  chat.model = config.model; chat.effort = effort; changed(chat);
  try {
    const sandboxPolicy = chat.mode === 'work' ? { type: 'workspaceWrite', writableRoots: [chat.workspace], networkAccess: false } : { type: 'readOnly', networkAccess: true };
    const result = await bridge.call('turn/start', { threadId: chat.threadId, input, model: config.model, effort, approvalPolicy: settings.approvalPolicy, approvalsReviewer: 'user', sandboxPolicy });
    if (chat.status === 'running') chat.activeTurnId = result.turn.id;
    changed(chat); res.json({ ok: true, turnId: result.turn.id });
  } catch (error) { chat.status = 'failed'; chat.error = error.message; chat.activeTurnId = null; changed(chat); throw error; }
}));
app.post('/api/chats/:id/stop', wrap(async (req, res) => {
  const chat = store.chat(req.params.id);
  const turnId = chat.activeTurnId;
  if (chat.threadId && turnId) {
    // turn/start can return before the engine registers its active task. Keep
    // an immediate Stop click effective across that short startup interval.
    for (let attempt = 0; attempt < 25; attempt++) {
      if (chat.status !== 'running' || chat.activeTurnId !== turnId) break;
      try { await bridge.call('turn/interrupt', { threadId: chat.threadId, turnId }); break; }
      catch (error) {
        if (!/no active turn/i.test(error.message) || attempt === 24) throw error;
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
  }
  res.json({ ok: true });
}));

app.post('/api/approvals/:id', wrap(async (req, res) => {
  const approval = approvals.get(req.params.id);
  if (!approval) throw new Error('This request has already been handled.');
  let result;
  if (approval.method === 'item/tool/requestUserInput') {
    const answers = {};
    for (const question of approval.params.questions || []) answers[question.id] = { answers: [String(req.body.answers?.[question.id] || '')] };
    result = { answers };
  } else if (approval.method === 'item/permissions/requestApproval') {
    // Keep grants turn-scoped, and never broaden beyond the engine's request.
    result = { permissions: req.body.decision === 'accept' ? approval.params.permissions : {}, scope: 'turn' };
  } else if (approval.method === 'mcpServer/elicitation/request') {
    result = { action: 'decline', content: null, _meta: null };
  } else {
    const decision = req.body.decision;
    if (!['accept', 'decline', 'cancel'].includes(decision)) throw new Error('Choose Allow, Deny, or Cancel.');
    result = { decision };
  }
  bridge.reply(approval.id, result); approvals.delete(req.params.id); notifyState(); res.json({ ok: true });
}));

app.get('/api/skills', wrap(async (req, res) => { await ready(); res.json(await bridge.call('skills/list', { cwds: [await validateDirectory(req.query.workspace || store.state.settings.workspace)] })); }));
app.get('/api/usage', wrap(async (_, res) => { await ready(); res.json(await bridge.call('account/rateLimits/read')); }));

app.post('/api/uploads', wrap(async (req, res) => {
  const name = path.basename(String(req.body.name || 'attachment')).slice(0, 180);
  const type = String(req.body.type || 'text/plain');
  const extension = path.extname(name).toLowerCase();
  const images = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  const textExtensions = ['.txt', '.md', '.csv', '.json', '.js', '.ts', '.tsx', '.jsx', '.py', '.html', '.css', '.yaml', '.yml', '.toml', '.xml', '.sql', '.sh', '.log'];
  if (!images.includes(type) && !textExtensions.includes(extension) && !type.startsWith('text/')) throw new Error('Attach an image, text document, or source file. PDF and Word files are not supported in this version.');
  const buffer = Buffer.from(String(req.body.data || ''), 'base64');
  if (buffer.length > 10 * 1024 * 1024) throw new Error('Each attachment must be under 10 MB.');
  const id = randomUUID();
  const directory = path.join(dataDir, 'uploads'); await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const filePath = path.join(directory, id + extension);
  await fs.writeFile(filePath, buffer, { mode: 0o600 });
  await fs.writeFile(path.join(directory, id + '.meta.json'), JSON.stringify({ id, name, type, path: filePath }), { mode: 0o600 });
  res.json({ id, name, type });
}));
async function resolveUpload(id) {
  if (!/^[a-f0-9-]{36}$/.test(String(id))) throw new Error('Invalid attachment.');
  return JSON.parse(await fs.readFile(path.join(dataDir, 'uploads', id + '.meta.json'), 'utf8'));
}
app.get('/api/uploads/:id', wrap(async (req, res) => {
  const file = await resolveUpload(req.params.id);
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('Only image attachments can be previewed.');
  res.type(file.type).sendFile(file.path);
}));

async function scopedPath(workspace, relative = '') {
  const base = await validateDirectory(workspace);
  if (!store.state.workspaces.includes(base) && !store.state.chats.some(c => c.workspace === base)) throw new Error('Add this workspace first.');
  const candidate = await fs.realpath(path.resolve(base, relative));
  if (candidate !== base && !candidate.startsWith(base + path.sep)) throw new Error('This file is outside the selected workspace.');
  return { base, candidate };
}
app.get('/api/files', wrap(async (req, res) => {
  const { base, candidate } = await scopedPath(req.query.workspace || store.state.settings.workspace, req.query.path || '');
  const entries = await fs.readdir(candidate, { withFileTypes: true });
  const hidden = new Set(['node_modules', '.git', '.data', '.DS_Store', 'dist', '.next']);
  const files = entries.filter(e => !hidden.has(e.name) && !e.isSymbolicLink()).map(e => ({ name: e.name, directory: e.isDirectory(), path: path.relative(base, path.join(candidate, e.name)) })).sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name));
  res.json({ path: path.relative(base, candidate), files });
}));
app.get('/api/file', wrap(async (req, res) => {
  const { candidate } = await scopedPath(req.query.workspace || store.state.settings.workspace, req.query.path || '');
  const stat = await fs.stat(candidate);
  if (!stat.isFile()) throw new Error('Select a file to preview.');
  if (stat.size > 512000) throw new Error('This file is too large to preview. Open it in your editor.');
  const buffer = await fs.readFile(candidate);
  if (buffer.includes(0)) throw new Error('This is a binary file. Text previews are available for documents and source files.');
  res.json({ content: buffer.toString('utf8'), name: path.basename(candidate), size: stat.size });
}));
app.get('/api/export', (_, res) => { res.setHeader('Content-Disposition', 'attachment; filename="claudex-export.json"'); res.json(store.state); });
app.post('/api/clear', wrap(async (_, res) => {
  if (store.state.chats.some(c => c.status === 'running')) throw new Error('Stop active responses before clearing conversations.');
  store.state.chats = []; store.save(); notifyState(); res.json({ ok: true });
}));

if (process.argv.includes('--dev')) {
  const { createServer: createVite } = await import('vite');
  const vite = await createVite({ root, server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(root, 'dist')));
  app.get('/{*path}', (_, res) => res.sendFile(path.join(root, 'dist/index.html')));
}
app.use((error, _, res, next) => { if (res.headersSent) return next(error); res.status(error.status || 400).json({ error: error.message || 'Something went wrong. Please try again.' }); });

server.listen(port, '127.0.0.1', () => {
  console.log(`ClaudeX is ready at http://localhost:${port}`);
  refreshEngine().catch(error => { engineError = error.message; notifyState(); });
});
function shutdown() { store.save(); bridge.stop(); server.close(); process.exit(0); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
