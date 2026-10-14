import { useEffect, useState } from 'react';
import { Monitor, Sun, Moon, Settings2, UserRound, FolderOpen, SlidersHorizontal, Shield, Info, Search, ExternalLink, RefreshCw, Download, Trash2, Check, ChevronDown, ArrowUpRight } from 'lucide-react';
import { Modal } from './Modal';
import { api, folderName, modelName, desktop, openExternal, download } from './api';
import type { State, Settings as Preferences } from './types';

const sections = [
  { id: 'general', name: 'General', icon: Settings2 },
  { id: 'account', name: 'Account', icon: UserRound },
  { id: 'workspace', name: 'Workspace', icon: FolderOpen },
  { id: 'codex', name: 'Codex', icon: SlidersHorizontal },
  { id: 'data', name: 'Data & privacy', icon: Shield },
  { id: 'about', name: 'About ClaudeX', icon: Info },
];
const searchTerms: Record<string, string> = {
  general: 'appearance theme light dark font transcript text size width motion name enter keyboard',
  account: 'account email sign in login connection plan usage limits',
  workspace: 'workspace folder path permissions projects',
  codex: 'codex model reasoning effort instructions approval commands',
  data: 'data privacy history export delete local storage',
  about: 'about claudex version shortcuts help',
};
function Row({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <div className="setting-row"><div className="setting-label"><div>{title}</div>{description && <p>{description}</p>}</div><div className="setting-control">{children}</div></div>;
}
export function Segments({ value, options, onChange, label }: { value: string; options: { value: string; label: React.ReactNode; title?: string }[]; onChange: (value: string) => void; label: string }) {
  return <div className="segments" role="group" aria-label={label}>{options.map(option => <button key={option.value} aria-pressed={value === option.value} title={option.title} className={value === option.value ? 'selected' : ''} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>;
}
function Toggle({ value, onChange, label }: { value: boolean; onChange: (value: boolean) => void; label: string }) {
  return <button className={`toggle ${value ? 'on' : ''}`} role="switch" aria-checked={value} aria-label={label} onClick={() => onChange(!value)}><span /></button>;
}

export function Settings({ state, close, save, toast, initialSection = 'general' }: { state: State; close: () => void; save: (changes: Partial<Preferences>) => void; toast: (message: string) => void; initialSection?: string }) {
  const [section, setSection] = useState(initialSection), [query, setQuery] = useState('');
  const [name, setName] = useState(state.settings.displayName), [workspace, setWorkspace] = useState(state.settings.workspace);
  const [instructions, setInstructions] = useState(state.settings.customInstructions), [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false), [confirmClear, setConfirmClear] = useState(false), [usage, setUsage] = useState<any>(null);
  const [login, setLogin] = useState<{ loginId: string; authUrl: string } | null>(null);
  const [enginePath, setEnginePath] = useState(state.settings.enginePath || '');
  const s = state.settings;
  const model = state.models.find(m => (m.model || m.id) === s.model);
  const availableSections = sections.filter(item => `${item.name} ${searchTerms[item.id]}`.toLowerCase().includes(query.toLowerCase()));
  const activeSection = query && !availableSections.some(item => item.id === section) ? availableSections[0]?.id : section;
  useEffect(() => { if (activeSection === 'account' && state.connected) api('/usage').then(setUsage).catch(() => {}); }, [activeSection, state.connected]);
  useEffect(() => { if (state.account) setLogin(null); }, [state.account]);
  async function action(fn: () => Promise<unknown>, success?: string) {
    setBusy(true);
    try { await fn(); if (success) toast(success); } catch (error) { toast((error as Error).message); } finally { setBusy(false); }
  }
  async function chooseFolder() {
    await action(async () => { const result = await api('/workspaces/choose', 'POST'); if (result.path) setWorkspace(result.path); });
  }
  return <Modal title="Settings" close={close} className="settings-modal">
    <aside className="settings-sidebar">
      <div className="settings-search"><Search size={17} /><input aria-label="Search settings" placeholder="Search" value={query} onChange={event => setQuery(event.target.value)} /></div>
      <div className="settings-caption">Settings</div>
      <nav aria-label="Settings categories">{availableSections.map(({ id, name, icon: Icon }) => <button key={id} className={activeSection === id ? 'active' : ''} onClick={() => setSection(id)}><Icon size={20} strokeWidth={1.6} /><span>{name}</span></button>)}</nav>
      <div className="settings-sidebar-footer"><img src="/favicon.svg" alt="" width="20" height="20" /><span>ClaudeX <small>0.1.0</small></span></div>
    </aside>
    <div className="settings-content">
      {!activeSection && <div className="empty-inline"><Search size={26} /><h2>No matching settings</h2><p>Try searching for “theme”, “model”, or “workspace”.</p></div>}
      {activeSection === 'general' && <>
        <h2>Appearance</h2>
        <Row title="Theme"><Segments label="Theme" value={s.theme} onChange={theme => save({ theme: theme as Preferences['theme'] })} options={[{ value: 'system', label: <Monitor size={21} />, title: 'System' }, { value: 'light', label: <Sun size={21} />, title: 'Light' }, { value: 'dark', label: <Moon size={21} />, title: 'Dark' }]} /></Row>
        <Row title="Chat font"><select aria-label="Chat font" value={s.font} onChange={e => save({ font: e.target.value as Preferences['font'] })}><option value="serif">Classic Serif</option><option value="sans">System Sans</option></select></Row>
        <Row title="Transcript text size" description="Size of the conversation text."><Segments label="Transcript text size" value={s.textSize} onChange={textSize => save({ textSize: textSize as Preferences['textSize'] })} options={['small', 'medium', 'large'].map(value => ({ value, label: capitalize(value) }))} /></Row>
        <Row title="Transcript width" description="Maximum width of the conversation and composer."><Segments label="Transcript width" value={s.width} onChange={width => save({ width: width as Preferences['width'] })} options={['narrow', 'medium', 'wide'].map(value => ({ value, label: capitalize(value) }))} /></Row>
        <Row title="Motion" description="Reduce transitions and the response indicator."><Segments label="Motion" value={s.reducedMotion ? 'reduced' : 'system'} onChange={value => save({ reducedMotion: value === 'reduced' })} options={[{ value: 'system', label: 'System' }, { value: 'reduced', label: 'Reduced' }]} /></Row>
        <h2>Make it yours</h2>
        <Row title="What should we call you?"><input className="name-input" aria-label="Your name" value={name} maxLength={40} onChange={e => setName(e.target.value)} onBlur={() => save({ displayName: name.trim() || 'you' })} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></Row>
        <Row title="Enter to send" description="Shift + Enter always adds a new line."><Toggle label="Enter to send" value={s.enterToSend} onChange={enterToSend => save({ enterToSend })} /></Row>
        <p className="settings-footnote">Your preferences save automatically.</p>
      </>}
      {activeSection === 'account' && <>
        <h2>Account</h2>
        <div className="account-summary"><div className="avatar large">{(s.displayName || 'R')[0].toUpperCase()}</div><div><h3>{state.account?.email || (state.account?.type === 'apiKey' ? 'OpenAI API account' : 'Your Codex account')}</h3><p>{state.account ? `${capitalize(state.account.planType || state.account.type)} · Connected through local Codex` : 'Connect your account to start a conversation.'}</p></div></div>
        <Row title="Codex connection" description="Uses the Codex CLI installed on this Mac."><span className={`connection-label ${state.connected ? 'connected' : ''}`}><span className="status-dot" />{state.connected ? 'Connected' : 'Disconnected'}</span></Row>
        <Row title="Refresh connection" description="Reconnect and refresh the available models."><button className="secondary-button" disabled={busy} onClick={() => action(() => api('/reconnect', 'POST'), 'Codex connection refreshed.')}><RefreshCw size={15} className={busy ? 'spinning' : ''} />Reconnect</button></Row>
        {desktop && <><h2>Codex executable</h2><p className="section-description">ClaudeX finds your installed Codex automatically. You can choose another executable if needed.</p><div className="path-input"><input aria-label="Codex executable path" placeholder="Automatic detection" value={enginePath} onChange={e => setEnginePath(e.target.value)} /></div><div className="button-row"><button className="secondary-button" disabled={busy} onClick={() => action(async () => { const result = await api('/engine/choose', 'POST'); if (result.path) setEnginePath(result.path); })}>Browse</button><button className="secondary-button" disabled={busy} onClick={() => action(async () => { await api('/settings', 'POST', { enginePath }); await api('/engine/restart', 'POST'); }, 'Codex executable updated.')}>Save & reconnect</button></div></>}
        {!state.account && <Row title="Sign in with ChatGPT" description="Use your ChatGPT plan through Codex."><button className="primary-button" disabled={busy} onClick={() => action(async () => { const result = await api('/login', 'POST'); setLogin(result); await openExternal(result.authUrl); })}>Sign in<ArrowUpRight size={15} /></button></Row>}
        {login && <div className="login-message"><p>Finish signing in in your browser, then return here.</p><a href={login.authUrl} target="_blank" rel="noreferrer">Open sign-in page <ExternalLink size={14} /></a><button className="text-button" onClick={() => action(async () => { await api('/login/cancel', 'POST', { loginId: login.loginId }); setLogin(null); })}>Cancel sign-in</button></div>}
        {state.engineError && <p className="inline-error">{state.engineError}</p>}
        <h2>Usage</h2>
        {usage ? <Usage data={usage} /> : <p className="muted">Usage information appears here when Codex makes it available.</p>}
        <p className="settings-footnote">ClaudeX shares the local Codex sign-in. Your credentials stay with Codex and are never sent to the web interface.</p>
      </>}
      {activeSection === 'workspace' && <>
        <h2>Workspace</h2>
        <p className="section-description">Give each conversation a place to work. Existing conversations keep the folder they started in.</p>
        <label className="field-label" htmlFor="workspace-path">Default folder</label>
        <div className="path-input"><FolderOpen size={18} /><input id="workspace-path" value={workspace} onChange={e => setWorkspace(e.target.value)} placeholder="/Users/you/Projects" /></div>
        <div className="button-row"><button className="secondary-button" disabled={busy} onClick={chooseFolder}><FolderOpen size={16} />Choose folder</button><button className="primary-button" disabled={busy || !workspace.trim()} onClick={() => action(() => api('/workspaces', 'POST', { path: workspace }), 'Default workspace updated.')}>Save folder</button></div>
        <h2>Recent folders</h2>
        <div className="workspace-list">{state.workspaces.map(directory => <button key={directory} onClick={() => { setWorkspace(directory); save({ workspace: directory }); }}><FolderOpen size={19} /><div><span>{folderName(directory)}</span><small>{directory}</small></div>{directory === s.workspace && <Check size={18} />}</button>)}</div>
        <h2>Access</h2>
        <Row title="Chat mode" description="Codex can read files and discuss your workspace."><span className="muted">Read only</span></Row>
        <Row title="Work mode" description="Codex can edit files in the conversation’s folder."><span className="muted">Workspace write</span></Row>
        <p className="settings-footnote">Codex can request approval for additional access when a task needs it.</p>
      </>}
      {activeSection === 'codex' && <>
        <h2>Model & reasoning</h2>
        <Row title="Default model"><select aria-label="Default model" value={s.model} onChange={e => { const m = state.models.find(m => (m.model || m.id) === e.target.value); save({ model: e.target.value, effort: m?.defaultReasoningEffort || 'medium' }); }}>{state.models.map(m => <option key={m.id} value={m.model || m.id}>{m.displayName || modelName(m.model || m.id)}</option>)}</select></Row>
        <Row title="Reasoning effort" description="More effort gives Codex more time to think."><select aria-label="Default reasoning effort" value={s.effort} onChange={e => save({ effort: e.target.value })}>{(model?.supportedReasoningEfforts || []).map(e => <option key={e.reasoningEffort} value={e.reasoningEffort}>{capitalize(e.reasoningEffort)}</option>)}</select></Row>
        <h2>Approvals</h2>
        <Row title="When should Codex ask?" description="Approval requests appear inside the conversation."><select aria-label="Approval policy" value={s.approvalPolicy} onChange={e => save({ approvalPolicy: e.target.value })}><option value="on-request">When needed</option><option value="untrusted">For untrusted commands</option></select></Row>
        <h2>Custom instructions</h2>
        <p className="section-description">Tell Codex how you prefer to work. These instructions apply when you start or reopen a conversation.</p>
        <textarea className="instructions-input" aria-label="Custom instructions" placeholder="For example: Keep replies concise. Explain changes before editing files." value={instructions} maxLength={12000} onChange={e => { setInstructions(e.target.value); setSaved(false); }} />
        <div className="button-row"><button className="secondary-button" onClick={() => { save({ customInstructions: instructions }); setSaved(true); }}>{saved ? <Check size={15} /> : null}{saved ? 'Saved' : 'Save instructions'}</button></div>
        <p className="settings-footnote">Workspace instructions in AGENTS.md and locally installed skills are available through the Codex engine.</p>
      </>}
      {activeSection === 'data' && <>
        <h2>Data & privacy</h2>
        <p className="section-description">Your conversation history, attachments, and preferences are stored on this Mac. Prompts and task context are sent to OpenAI through Codex when you use the assistant.</p>
        <Row title="Conversation history" description="Saved locally and available after restarting ClaudeX."><span className="muted">{state.chats.length} conversation{state.chats.length === 1 ? '' : 's'}</span></Row>
        <Row title="Export your data" description="Download conversations and preferences as JSON."><button className="secondary-button" onClick={() => action(async () => download("claudex-export.json", JSON.stringify(await api("/export"), null, 2), "application/json"))}><Download size={15} />Export data</button></Row>
        {desktop ? <Row title="Refresh Codex history" description="Reload saved conversations from the same local Codex store."><button className="secondary-button" disabled={busy} onClick={() => action(() => api('/history/refresh', 'POST'), 'Codex history refreshed.')}><RefreshCw size={15} />Refresh history</button></Row> : <Row title="Clear conversation history" description="Remove ClaudeX’s saved conversations. Codex’s own logs are separate."><button className="secondary-button danger-text" disabled={busy} onClick={() => setConfirmClear(true)}><Trash2 size={15} />Clear history</button></Row>}
        {confirmClear && <div className="confirm-inline"><p>Delete all {state.chats.length} saved conversations from ClaudeX? This cannot be undone.</p><div className="button-row"><button className="secondary-button" onClick={() => setConfirmClear(false)}>Keep conversations</button><button className="danger-button" disabled={busy} onClick={() => action(async () => { await api('/clear', 'POST'); setConfirmClear(false); }, 'Conversation history cleared.')}>Delete all conversations</button></div></div>}
        <h2>Local connection</h2>
        <Row title="Server address" description="Only accessible from this Mac."><span className="muted">{desktop ? 'Native desktop connection' : window.location.host}</span></Row>
        <Row title="Account credentials" description="Managed by the installed Codex CLI."><span className="muted">Kept out of the browser</span></Row>
      </>}
      {activeSection === 'about' && <>
        <div className="about-brand"><img src="/favicon.svg" width="56" height="56" alt="ClaudeX logo" /><h2>ClaudeX</h2><p>A little more room to think.</p><small>Version 0.1.0 · {desktop ? 'Desktop app' : 'Web preview'}</small></div>
        <h2>Keyboard shortcuts</h2>
        <Row title="New conversation"><kbd>⌘ N</kbd></Row>
        <Row title="Search conversations"><kbd>⌘ K</kbd></Row>
        <Row title="Open settings"><kbd>⌘ ,</kbd></Row>
        <Row title="Send message"><kbd>{s.enterToSend ? 'Enter' : '⌘ Enter'}</kbd></Row>
        <Row title="New line"><kbd>Shift Enter</kbd></Row>
        <Row title="Close a panel"><kbd>Esc</kbd></Row>
        <p className="settings-footnote">A personal, independent client powered by Codex. Inspired by the Claude Desktop interface. Not affiliated with Anthropic or OpenAI.</p>
        <a className="text-link" href="https://learn.chatgpt.com/docs/app-server" target="_blank" rel="noreferrer">Codex app-server documentation <ExternalLink size={14} /></a>
      </>}
    </div>
  </Modal>;
}
function capitalize(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
function Usage({ data }: { data: any }) {
  const limits = data.rateLimitsByLimitId || (data.rateLimits ? { codex: data.rateLimits } : {});
  const windows = Object.entries(limits).flatMap(([name, limit]: [string, any]) => ['primary', 'secondary'].filter(key => limit[key]).map(key => ({ ...limit[key], name })));
  if (!windows.length) return <p className="muted">No usage limits were returned by Codex.</p>;
  return <div className="usage-list">{windows.map((window, i) => <div className="usage-row" key={i}><div><span>{window.windowDurationMins >= 1440 ? `${Math.round(window.windowDurationMins / 1440)}-day limit` : `${Math.round(window.windowDurationMins / 60)}-hour limit`}</span><small>{window.resetsAt ? `Resets ${new Date(window.resetsAt * 1000).toLocaleString()}` : 'Reset time unavailable'}</small></div><span>{Math.max(0, Math.round(100 - window.usedPercent))}% remaining</span></div>)}</div>;
}
