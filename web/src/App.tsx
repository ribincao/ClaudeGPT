import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, PanelLeftClose, PanelLeftOpen, FolderOpen, Sparkles, ChevronDown, MoreHorizontal, Settings2, ArrowUpRight, PenLine, GraduationCap, Code2, Compass, Pin, Archive, Trash2, Download, Check, Copy, Terminal, ChevronRight, FileText, ShieldCheck, LoaderCircle, X, AlertCircle, MessageSquare, ArrowDown, RefreshCw } from 'lucide-react';
import { api, copy, download, folderName, modelName, subscribeEvents, attachmentUrl, desktop } from './api';
import { Composer } from './Composer';
import { Settings } from './Settings';
import { Files } from './Files';
import { Modal } from './Modal';
import { Markdown } from './Markdown';
import type { Approval, Attachment, Chat, Item, Settings as Preferences, Skill, State } from './types';

type Dialog = 'search' | 'workspace' | 'skills' | 'rename' | 'delete' | null;
export default function App() {
  const [state, setState] = useState<State | null>(null), [activeId, setActiveId] = useState<string | null>(() => localStorage.getItem('claudex-active'));
  const [sidebar, setSidebar] = useState(() => window.innerWidth > 760), [settingsOpen, setSettingsOpen] = useState(false), [settingsSection, setSettingsSection] = useState('general');
  const [dialog, setDialog] = useState<Dialog>(null), [query, setQuery] = useState(''), [accountMenu, setAccountMenu] = useState(false);
  const [chatMenu, setChatMenu] = useState<string | null>(null), [targetId, setTargetId] = useState<string | null>(null), [rename, setRename] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>(() => { try { return JSON.parse(localStorage.getItem('claudex-drafts') || '{}'); } catch { return {}; } });
  const [mode, setMode] = useState<'chat' | 'work'>('chat'), [busy, setBusy] = useState(false), [workspacePath, setWorkspacePath] = useState('');
  const [filesOpen, setFilesOpen] = useState(false), [previewFile, setPreviewFile] = useState<string | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]), [skillsBusy, setSkillsBusy] = useState(false), [skillError, setSkillError] = useState(''), [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [notification, setNotification] = useState(''), [showArchived, setShowArchived] = useState(false), [initialError, setInitialError] = useState('');
  const [nearBottom, setNearBottom] = useState(true), [online, setOnline] = useState(true);
  const scroll = useRef<HTMLDivElement>(null), messageEnd = useRef<HTMLDivElement>(null), toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const active = state?.chats.find(c => c.id === activeId);
  const draftKey = active?.id || 'new';
  const value = drafts[draftKey] || '';
  const workspace = active?.workspace || state?.settings.workspace || '';
  const running = active?.status === 'running';
  const toast = useCallback((message: string) => { setNotification(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setNotification(''), 5500); }, []);
  const closeImage = useCallback(() => setImagePreview(null), []);
  useEffect(() => { const preview = (event: Event) => setImagePreview((event as CustomEvent<string>).detail); window.addEventListener('claudex-image', preview); return () => window.removeEventListener('claudex-image', preview); }, []);
  const closeDialog = useCallback(() => { setDialog(null); setQuery(''); }, []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const openSettings = useCallback((section = 'general') => { setSettingsSection(section); setSettingsOpen(true); setAccountMenu(false); }, []);
  const newChat = useCallback(() => { setActiveId(null); setFilesOpen(false); setSelectedSkill(null); setAccountMenu(false); if (window.innerWidth <= 760) setSidebar(false); setTimeout(() => document.querySelector<HTMLTextAreaElement>('.composer textarea')?.focus(), 50); }, []);

  useEffect(() => {
    let disposed = false;
    const unsubscribe = subscribeEvents(payload => {
        if (payload.type === 'state') setState(payload.state);
        if (payload.type === 'chat') setState(previous => previous ? { ...previous, chats: previous.chats.map(c => c.id === payload.chat.id ? payload.chat : c) } : previous);
        if (payload.type === 'delta') setState(previous => {
          if (!previous) return previous;
          return { ...previous, chats: previous.chats.map(chat => {
            if (chat.id !== payload.chatId) return chat;
            const exists = chat.items.some(i => i.id === payload.itemId);
            return { ...chat, items: exists ? chat.items.map(item => item.id === payload.itemId ? { ...item, text: (item.text || '') + payload.delta } : item) : [...chat.items, { id: payload.itemId, type: 'agentMessage', text: payload.delta, turnId: payload.turnId }] };
          }) };
        });
        if (payload.type === 'login') toast(payload.success ? 'Signed in. You’re ready to chat.' : payload.error || 'Sign-in was not completed.');
    }, setOnline);
    api<State>('/state').then(data => { if (!disposed) setState(data); }).catch(e => setInitialError(e.message));
    return () => { disposed = true; unsubscribe(); };
  }, [toast]);
  useEffect(() => { localStorage.setItem('claudex-drafts', JSON.stringify(drafts)); }, [drafts]);
  useEffect(() => { activeId ? localStorage.setItem('claudex-active', activeId) : localStorage.removeItem('claudex-active'); setPreviewFile(null); }, [activeId]);
  useEffect(() => { if (state && activeId && !state.chats.some(c => c.id === activeId)) setActiveId(null); }, [activeId, state]);
  useEffect(() => {
    if (!state) return;
    const s = state.settings, media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.dataset.theme = s.theme === 'system' ? (media.matches ? 'dark' : 'light') : s.theme;
    apply(); media.addEventListener('change', apply);
    document.documentElement.dataset.font = s.font; document.documentElement.dataset.textSize = s.textSize; document.documentElement.dataset.width = s.width;
    document.documentElement.dataset.motion = s.reducedMotion ? 'reduced' : 'system';
    return () => media.removeEventListener('change', apply);
  }, [state?.settings]);
  useEffect(() => {
    if (nearBottom) messageEnd.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  }, [active?.items, nearBottom]);
  useEffect(() => { setNearBottom(true); setTimeout(() => messageEnd.current?.scrollIntoView({ block: 'end' }), 50); }, [activeId]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === 'n') { e.preventDefault(); closeDialog(); newChat(); }
      if (e.key.toLowerCase() === 'k') { e.preventDefault(); setDialog('search'); setQuery(''); }
      if (e.key === ',') { e.preventDefault(); openSettings(); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [newChat, openSettings, closeDialog]);
  useEffect(() => { document.title = active ? `${active.title} · ClaudeX` : 'ClaudeX'; }, [active?.title]);
  useEffect(() => {
    if (!accountMenu && !chatMenu) return;
    const outside = (event: MouseEvent) => { if (!(event.target as HTMLElement).closest('.menu-anchor')) { setAccountMenu(false); setChatMenu(null); } };
    document.addEventListener('mousedown', outside); return () => document.removeEventListener('mousedown', outside);
  }, [accountMenu, chatMenu]);
  const save = useCallback(async (changes: Partial<Preferences>) => { try { await api('/settings', 'POST', changes); } catch (e) { toast((e as Error).message); } }, [toast]);
  const openFiles = useCallback((file: string) => { setPreviewFile(file); setFilesOpen(true); }, []);
  function setValue(text: string) { setDrafts(previous => ({ ...previous, [draftKey]: text })); }
  function chooseChat(id: string) { setActiveId(id); closeDialog(); setChatMenu(null); setSelectedSkill(null); if (window.innerWidth < 760) setSidebar(false); }
  async function chatAction(id: string, method: string, body?: unknown) {
    try { await api(`/chats/${id}`, method, body); } catch (e) { toast((e as Error).message); }
    setChatMenu(null);
  }
  function exportChat(chat: Chat) {
    const messages = chat.items.filter(i => ['userMessage', 'agentMessage'].includes(i.type)).map(i => `## ${i.type === 'userMessage' ? 'You' : 'ClaudeX'}\n\n${i.text || i.content?.map(c => c.text || '').join('\n') || ''}`).join('\n\n');
    download(`${chat.title.replace(/[^\w\s-]/g, '').slice(0, 50) || 'conversation'}.md`, `# ${chat.title}\n\n${messages}\n`); setChatMenu(null);
  }
  async function send(attachments: Attachment[]) {
    if (!state || busy || running) return false;
    setBusy(true);
    try {
      let chat = active;
      if (!chat) {
        chat = await api<Chat>('/chats', 'POST', { workspace, mode });
        const id = chat.id;
        setDrafts(previous => ({ ...previous, [id]: value }));
        setActiveId(id);
      }
      await api(`/chats/${chat.id}/message`, 'POST', { text: value, attachments, model: state.settings.model, effort: state.settings.effort, skill: selectedSkill ? { name: selectedSkill.name, path: selectedSkill.path } : undefined });
      setDrafts(previous => ({ ...previous, [draftKey]: '', [chat!.id]: '' })); setSelectedSkill(null); setNearBottom(true); return true;
    } catch (e) { toast((e as Error).message); return false; } finally { setBusy(false); }
  }
  async function stop() { if (active) try { await api(`/chats/${active.id}/stop`, 'POST'); } catch (e) { toast((e as Error).message); } }
  function changeMode(next: 'chat' | 'work') {
    if (active && active.mode !== next) { const draft = value; newChat(); setDrafts(previous => ({ ...previous, new: draft })); toast(`New ${next === 'work' ? 'Work' : 'Chat'} conversation. Your current chat is saved.`); }
    setMode(next);
  }
  function openWorkspace() { setWorkspacePath(workspace); setDialog('workspace'); setQuery(''); }
  async function setWorkspace(directory: string) {
    try { await api('/workspaces', 'POST', { path: directory }); closeDialog(); if (active && active.workspace !== directory) newChat(); } catch (e) { toast((e as Error).message); }
  }
  async function openSkills() {
    setDialog('skills'); setQuery(''); setSkillsBusy(true); setSkillError('');
    try { const result = await api(`/skills?workspace=${encodeURIComponent(workspace)}`); setSkills((result.data || []).flatMap((entry: { skills: Skill[] }) => entry.skills || []).filter((s: Skill) => s.enabled !== false)); }
    catch (e) { setSkillError((e as Error).message); } finally { setSkillsBusy(false); }
  }
  const visibleChats = useMemo(() => (state?.chats || []).filter(c => !c.archived).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt), [state?.chats]);
  const filteredChats = (state?.chats || []).filter(c => (showArchived ? c.archived : !c.archived) && `${c.title} ${c.items.map(i => i.text || i.content?.map(c => c.text).join(' ') || '').join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  if (!state) return <div className="boot-screen"><img src="/favicon.svg" width="44" height="44" alt="" /><h1>ClaudeX</h1><p>{initialError || 'Opening your workspace…'}</p>{initialError && <button className="secondary-button" onClick={() => window.location.reload()}>Try again</button>}</div>;
  const approvals = state.approvals.filter(a => a.params.threadId === active?.threadId);
  const ready = state.connected && !!state.account && online;
  const target = state.chats.find(c => c.id === targetId);
  const time = new Date().getHours();
  const greeting = time < 5 ? 'Up late' : time < 12 ? 'Good morning' : time < 18 ? 'Good afternoon' : 'Good evening';
  const composer = <Composer value={value} setValue={setValue} onSend={send} onStop={stop} busy={busy} running={!!running} settings={state.settings} models={state.models} mode={active?.mode || mode} setMode={changeMode} workspace={workspace} onWorkspace={openWorkspace} onSave={save} toast={toast} connected={ready} selectedSkill={selectedSkill} clearSkill={() => setSelectedSkill(null)} openSkills={openSkills} draftKey={draftKey} />;
  return <div className={`app-shell ${desktop ? 'desktop-shell' : ''} ${sidebar ? 'sidebar-open' : ''}`}>
    {desktop && <div className="desktop-dragbar" data-tauri-drag-region aria-hidden="true" />}
    {sidebar && <><button className="sidebar-scrim" aria-label="Close sidebar" onClick={() => setSidebar(false)} /><aside className="sidebar">
      <div className="sidebar-brand"><a href="/" onClick={e => { e.preventDefault(); newChat(); }}><img src="/favicon.svg" width="27" height="27" alt="" /><span>ClaudeX</span></a><button className="icon-button" title="Collapse sidebar" aria-label="Collapse sidebar" onClick={() => setSidebar(false)}><PanelLeftClose size={18} strokeWidth={1.5} /></button></div>
      <nav className="main-nav" aria-label="Main navigation"><button className="new-chat" onClick={newChat}><Plus size={20} /><span>New chat</span><kbd>⌘ N</kbd></button><button onClick={() => { setDialog('search'); setQuery(''); }}><Search size={18} /><span>Search chats</span><kbd>⌘ K</kbd></button><button onClick={openWorkspace}><FolderOpen size={18} /><span>Projects</span></button><button onClick={openSkills}><Sparkles size={18} /><span>Skills</span></button></nav>
      <div className="conversation-list"><div className="list-heading">Your conversations<button className="icon-button" title="Search conversations" aria-label="Search conversations" onClick={() => setDialog('search')}><Search size={14} /></button></div>
        {visibleChats.length === 0 ? <div className="sidebar-empty"><p>A fresh start.</p><span>Your conversations will appear here.</span></div> : visibleChats.map((chat, index) => <div key={chat.id}>
          {(index === 0 || groupLabel(chat) !== groupLabel(visibleChats[index - 1])) && <div className="chat-group">{chat.pinned ? 'Pinned' : groupLabel(chat)}</div>}
          <div className={`chat-row ${activeId === chat.id ? 'active' : ''}`}><button className="chat-select" onClick={() => chooseChat(chat.id)}>{chat.pinned ? <Pin size={13} /> : chat.status === 'running' ? <span className="running-dot" /> : <MessageSquare size={13} />}<span>{chat.title}</span></button><div className="menu-anchor"><button className="icon-button chat-more" aria-label={`Options for ${chat.title}`} onClick={() => setChatMenu(chatMenu === chat.id ? null : chat.id)}><MoreHorizontal size={16} /></button>{chatMenu === chat.id && <ChatMenu chat={chat} rename={() => { setTargetId(chat.id); setRename(chat.title); setDialog('rename'); setChatMenu(null); }} pin={() => chatAction(chat.id, 'PATCH', { pinned: !chat.pinned })} archive={() => chatAction(chat.id, 'PATCH', { archived: true })} remove={() => { setTargetId(chat.id); setDialog('delete'); setChatMenu(null); }} exportChat={() => exportChat(chat)} />}</div></div>
        </div>)}
      </div>
      <div className="sidebar-footer"><div className="menu-anchor account-anchor">{accountMenu && <div className="popup account-popup"><div className="account-menu-title">{state.account?.email || state.settings.displayName}</div><button onClick={() => openSettings()}><Settings2 size={17} />Settings<kbd>⌘ ,</kbd></button><button onClick={() => openSettings('account')}><ShieldCheck size={17} />Codex connection</button><button onClick={() => openSettings('about')}><Sparkles size={17} />About ClaudeX</button></div>}<button className="account-button" aria-expanded={accountMenu} onClick={() => setAccountMenu(!accountMenu)}><div className="avatar">{(state.settings.displayName || 'R')[0].toUpperCase()}</div><div><span>{state.settings.displayName || 'Your account'}</span><small><span className={`status-dot ${ready ? 'live' : ''}`} />{ready ? 'Codex connected' : 'Connect Codex'}</small></div><ChevronDown size={14} /></button></div><button className="icon-button settings-shortcut" aria-label="Open settings" onClick={() => openSettings()}><Settings2 size={19} /></button></div>
    </aside></>}
    <main className={`main ${filesOpen ? 'with-files' : ''}`}>
      <header className="main-header"><div>{!sidebar && <button className="icon-button" title="Open sidebar" aria-label="Open sidebar" onClick={() => setSidebar(true)}><PanelLeftOpen size={20} /></button>}{active && <span className="conversation-title">{active.title}</span>}</div><div>{active ? <><button className={`header-workspace ${filesOpen ? 'active' : ''}`} onClick={() => { setFilesOpen(!filesOpen); setPreviewFile(null); }}><FolderOpen size={16} /><span>Files</span></button><div className="menu-anchor"><button className="icon-button" aria-label="Conversation options" onClick={() => setChatMenu(chatMenu === `header-${active.id}` ? null : `header-${active.id}`)}><MoreHorizontal size={20} /></button>{chatMenu === `header-${active.id}` && <ChatMenu chat={active} rename={() => { setTargetId(active.id); setRename(active.title); setDialog('rename'); setChatMenu(null); }} pin={() => chatAction(active.id, 'PATCH', { pinned: !active.pinned })} archive={() => chatAction(active.id, 'PATCH', { archived: true })} remove={() => { setTargetId(active.id); setDialog('delete'); setChatMenu(null); }} exportChat={() => exportChat(active)} />}</div></> : <button className="engine-status" onClick={() => openSettings('account')}><span className={`status-dot ${ready ? 'live' : ''}`} />{ready ? 'Local Codex' : online ? 'Connect Codex' : 'Reconnecting…'}<ChevronRight size={12} /></button>}</div></header>
      {!active?.items.length ? <div className="home"><div className="home-inner"><h1><img src="/knot.svg" alt="" width="45" height="45" /><span>{greeting}, {state.settings.displayName || 'you'}.</span></h1>{composer}<div className="suggestions">{[{ icon: PenLine, text: 'Write', prompt: 'Help me write ' }, { icon: GraduationCap, text: 'Learn', prompt: 'Help me understand ' }, { icon: Code2, text: 'Code', prompt: 'Help me build ' }, { icon: Compass, text: 'Plan', prompt: 'Help me plan ' }].map(({ icon: Icon, text, prompt }) => <button key={text} onClick={() => { setValue(prompt); if (text === 'Code') setMode('work'); document.querySelector<HTMLTextAreaElement>('.composer textarea')?.focus(); }}><Icon size={18} strokeWidth={1.5} />{text}</button>)}</div>{!ready && <div className="connect-hint"><span>{online ? state.engineError || 'Connect your Codex account to start chatting.' : 'The local server is reconnecting. Your conversations are saved.'}</span><button className="text-button" onClick={() => openSettings('account')}>Open connection settings<ArrowUpRight size={14} /></button></div>}</div><p className="home-footer">A little more room to think.</p></div> : <>
        <div className="transcript-scroll" ref={scroll} onScroll={e => { const el = e.currentTarget; setNearBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120); }}><div className="transcript">
          {active.archived && <div className="archived-notice"><Archive size={16} />This conversation is archived.<button className="text-button" onClick={() => chatAction(active.id, 'PATCH', { archived: false })}>Restore</button></div>}
          {active.items.map(item => <Message key={item.id} item={item} onFile={openFiles} toast={toast} />)}
          {running && <div className="thinking" role="status"><img src="/knot.svg" width="20" height="20" alt="" /><span>{approvals.length ? 'Waiting for your response' : 'Thinking'}<span className="thinking-dots"><i /><i /><i /></span></span></div>}
          {active.plan?.length ? <details className="work-plan"><summary>Task plan <span>{active.plan.filter(p => p.status === 'completed').length}/{active.plan.length}</span></summary>{active.plan.map((step, i) => <div key={i}>{step.status === 'completed' ? <Check size={15} /> : <span className="plan-circle" />}<span>{step.step}</span></div>)}</details> : null}
          {approvals.map(approval => <ApprovalRequest key={approval.id} approval={approval} chat={active} toast={toast} />)}
          {active.error && <div className="chat-error" role="alert"><AlertCircle size={17} /><div><strong>Something interrupted the response</strong><p>{active.error}</p><span>You can send another message to continue.</span></div></div>}
          {active.status === 'interrupted' && !active.error && <p className="response-stopped">Response stopped. Send another message whenever you’re ready.</p>}
          <div ref={messageEnd} />
        </div></div>
        <div className="conversation-composer">{!nearBottom && <button className="scroll-bottom" aria-label="Scroll to latest message" onClick={() => { setNearBottom(true); messageEnd.current?.scrollIntoView({ behavior: 'smooth' }); }}><ArrowDown size={17} /></button>}{composer}<div className="composer-footnote"><span>{active.mode === 'work' ? 'Working in' : 'Reading'} <button onClick={openWorkspace}>{folderName(workspace)}</button></span><span>Codex can make mistakes. Review important changes.</span></div></div>
      </>}
    </main>
    {filesOpen && <Files workspace={workspace} initialFile={previewFile} close={() => setFilesOpen(false)} addToMessage={file => { setValue(`${value}${value ? '\n' : ''}Please look at ${file}`); toast('File path added to your message.'); }} />}
    {imagePreview && <Modal title="Image preview" close={closeImage} className="image-modal"><img src={imagePreview} alt="Attached image" /></Modal>}
    {settingsOpen && <Settings state={state} close={closeSettings} save={save} toast={toast} initialSection={settingsSection} />}
    {dialog === 'search' && <Modal title="Search conversations" close={closeDialog} className="search-modal"><div className="dialog-search"><Search size={21} /><input autoFocus aria-label="Search conversations" placeholder="Search your conversations…" value={query} onChange={e => setQuery(e.target.value)} /></div><div className="search-tabs"><button className={!showArchived ? 'active' : ''} onClick={() => setShowArchived(false)}>Conversations</button><button className={showArchived ? 'active' : ''} onClick={() => setShowArchived(true)}>Archived</button><span>{filteredChats.length}</span></div><div className="search-results">{filteredChats.length ? filteredChats.map(chat => <button key={chat.id} onClick={() => chooseChat(chat.id)}><MessageSquare size={18} /><div><span>{chat.title}</span><small>{folderName(chat.workspace)} · {new Date(chat.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></div><ChevronRight size={16} /></button>) : <div className="empty-inline"><Search size={26} /><h2>{query ? 'No conversations found' : showArchived ? 'No archived conversations' : 'Your story starts here'}</h2><p>{query ? 'Try a different word or phrase.' : 'Start a new chat and it will appear here.'}</p></div>}</div></Modal>}
    {dialog === 'workspace' && <Modal title="Choose workspace" close={closeDialog} className="workspace-modal"><h2>A place to work</h2><p>Choose a folder for your next conversation.</p><div className="workspace-list">{state.workspaces.map(directory => <button key={directory} onClick={() => setWorkspace(directory)}><FolderOpen size={21} /><div><span>{folderName(directory)}</span><small>{directory}</small></div>{directory === workspace && <Check size={18} />}</button>)}</div><div className="workspace-dialog-divider" /><label className="field-label" htmlFor="new-workspace">Or use another folder</label><div className="path-input"><FolderOpen size={17} /><input id="new-workspace" value={workspacePath} onChange={e => setWorkspacePath(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') setWorkspace(workspacePath); }} /></div><div className="button-row"><button className="secondary-button" onClick={async () => { try { const result = await api('/workspaces/choose', 'POST'); if (result.path) { setWorkspacePath(result.path); closeDialog(); if (active && active.workspace !== result.path) newChat(); } } catch (e) { toast((e as Error).message); } }}><FolderOpen size={16} />Browse folders</button><button className="primary-button" onClick={() => setWorkspace(workspacePath)}>Use folder</button></div>{active && <p className="dialog-footnote">Changing folders starts a new conversation. This chat stays saved.</p>}</Modal>}
    {dialog === 'skills' && <Modal title="Choose a skill" close={closeDialog} className="search-modal skills-modal"><div className="dialog-search"><Sparkles size={21} /><input aria-label="Search skills" placeholder="Find a skill…" value={query} onChange={e => setQuery(e.target.value)} /></div><p className="skills-description">Your installed Codex skills, ready when you need them.</p><div className="search-results">{skillsBusy ? <div className="empty-inline"><LoaderCircle size={23} className="spinning" /><p>Loading your skills…</p></div> : skillError ? <div className="empty-inline"><AlertCircle size={25} /><p>{skillError}</p><button className="secondary-button" onClick={openSkills}>Try again</button></div> : skills.filter(s => `${s.name} ${s.description}`.toLowerCase().includes(query.toLowerCase())).map(skill => <button key={skill.path} onClick={() => { setSelectedSkill(skill); closeDialog(); }}><Sparkles size={18} /><div><span>{skill.name}</span><small>{skill.shortDescription || skill.description}</small></div><Plus size={16} /></button>)}{!skillsBusy && !skillError && !skills.filter(s => `${s.name} ${s.description}`.toLowerCase().includes(query.toLowerCase())).length && <div className="empty-inline"><p>No matching skills. Try another search.</p></div>}</div></Modal>}
    {dialog === 'rename' && target && <Modal title="Rename conversation" close={closeDialog} className="small-modal"><h2>Rename conversation</h2><input className="full-input" aria-label="Conversation name" value={rename} maxLength={120} onChange={e => setRename(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && rename.trim()) { chatAction(target.id, 'PATCH', { title: rename }); closeDialog(); } }} /><div className="button-row"><button className="secondary-button" onClick={closeDialog}>Cancel</button><button className="primary-button" disabled={!rename.trim()} onClick={() => { chatAction(target.id, 'PATCH', { title: rename }); closeDialog(); }}>Save name</button></div></Modal>}
    {dialog === 'delete' && target && <Modal title="Delete conversation" close={closeDialog} className="small-modal"><h2>Delete this conversation?</h2><p>“{target.title}” will be removed from ClaudeX. This cannot be undone.</p><div className="button-row"><button className="secondary-button" onClick={closeDialog}>Keep conversation</button><button className="danger-button" disabled={target.status === 'running'} onClick={() => { chatAction(target.id, 'DELETE'); closeDialog(); }}>Delete conversation</button></div>{target.status === 'running' && <p>Stop the response before deleting this conversation.</p>}</Modal>}
    {notification && <div className="toast" role="status"><span>{notification}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotification('')}><X size={15} /></button></div>}
  </div>;
}

function groupLabel(chat: Chat) {
  if (chat.pinned) return 'Pinned';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (chat.updatedAt >= today.getTime()) return 'Today';
  if (chat.updatedAt >= today.getTime() - 86400000) return 'Yesterday';
  return 'Earlier';
}
function ChatMenu({ chat, rename, pin, archive, remove, exportChat }: { chat: Chat; rename: () => void; pin: () => void; archive: () => void; remove: () => void; exportChat: () => void }) {
  return <div className="popup chat-popup"><button onClick={rename}><PenLine size={15} />Rename</button><button onClick={pin}><Pin size={15} />{chat.pinned ? 'Unpin' : 'Pin conversation'}</button><button onClick={exportChat}><Download size={15} />Export as Markdown</button><button onClick={archive}><Archive size={15} />Archive</button><div className="popup-divider" /><button className="danger-text" onClick={remove}><Trash2 size={15} />Delete</button></div>;
}
function Message({ item, onFile, toast }: { item: Item; onFile: (file: string) => void; toast: (message: string) => void }) {
  const [copied, setCopied] = useState(false);
  const text = item.text || item.content?.filter(c => c.type === 'text').map(c => c.text).join('\n') || '';
  if (item.type === 'userMessage') return <article className="user-message" aria-label="Your message"><div className="user-bubble">{item.attachments?.length ? <div className="message-attachments">{item.attachments.map(file => file.type.startsWith('image/') ? <a key={file.id} href={attachmentUrl(file.id)} onClick={event => { event.preventDefault(); window.dispatchEvent(new CustomEvent("claudex-image", { detail: attachmentUrl(file.id) })); }}><img src={attachmentUrl(file.id)} alt={file.name} /></a> : <span key={file.id}><FileText size={15} />{file.name}</span>)}</div> : null}{text && <div className="user-text">{text}</div>}</div></article>;
  if (item.type === 'agentMessage' && text) return <article className="assistant-message" aria-label="ClaudeX response"><div className="assistant-avatar"><img src="/knot.svg" width="24" height="24" alt="" /></div><div className="assistant-body"><Markdown text={text} onFile={onFile} /><div className="message-actions"><button className="icon-button" aria-label="Copy response" onClick={() => copy(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => toast('Could not copy. Select the text and copy it manually.'))}>{copied ? <Check size={15} /> : <Copy size={15} />}</button></div></div></article>;
  if (item.type === 'commandExecution') return <details className="tool-activity"><summary><Terminal size={15} /><span>{item.command || 'Running a command'}</span>{item.status === 'inProgress' ? <LoaderCircle size={13} className="spinning" /> : <span className={item.exitCode ? 'danger-text' : 'muted'}>{item.exitCode ? `Exit ${item.exitCode}` : 'Done'}</span>}<ChevronDown size={13} /></summary><pre>{item.command}{item.aggregatedOutput ? `\n\n${item.aggregatedOutput}` : '\nNo output.'}</pre></details>;
  if (item.type === 'fileChange') return <details className="tool-activity file-changes"><summary><FileText size={15} /><span>{item.changes?.length || 0} file{item.changes?.length === 1 ? '' : 's'} changed</span><ChevronDown size={13} /></summary>{item.changes?.map(change => <div key={change.path}><button className="file-link" onClick={() => onFile(change.path)}>{change.path}<ArrowUpRight size={12} /></button>{change.diff && <pre>{change.diff}</pre>}</div>)}</details>;
  if (item.type === 'mcpToolCall') return <details className="tool-activity"><summary><Sparkles size={15} /><span>{item.server} · {item.tool}</span><span className="muted">{item.status === 'inProgress' ? 'Working' : 'Done'}</span><ChevronDown size={13} /></summary><pre>{JSON.stringify(item.result || {}, null, 2).slice(0, 20000)}</pre></details>;
  if (item.type === 'webSearch') return <div className="simple-activity"><Search size={15} /><span>Searched the web</span></div>;
  return null;
}
function ApprovalRequest({ approval, chat, toast }: { approval: Approval; chat: Chat; toast: (message: string) => void }) {
  const [answers, setAnswers] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false);
  const questions = approval.params.questions || [];
  const isQuestion = approval.method === 'item/tool/requestUserInput';
  const isFile = approval.method.includes('fileChange'), isMcp = approval.method.includes('elicitation');
  const changes = chat.items.find(i => i.id === approval.params.itemId)?.changes;
  async function respond(decision: string) { setBusy(true); try { await api(`/approvals/${approval.id}`, 'POST', { decision, answers }); } catch (e) { toast((e as Error).message); setBusy(false); } }
  return <div className="approval-request"><div className="approval-heading"><ShieldCheck size={20} /><h3>{isQuestion ? 'A quick question' : isFile ? 'Allow these file changes?' : isMcp ? 'A connected tool needs input' : 'Codex needs your approval'}</h3></div>
    {approval.params.reason && <p>{approval.params.reason}</p>}
    {approval.params.command && <pre>{approval.params.command}</pre>}
    {changes?.map(change => <details key={change.path}><summary>{change.path}</summary><pre>{change.diff || 'File change requested.'}</pre></details>)}
    {approval.method.includes('permissions') && <pre>{JSON.stringify(approval.params.permissions, null, 2)}</pre>}
    {isQuestion && questions.map(question => <fieldset key={question.id}><legend>{question.question}</legend>{question.options?.map(option => <label className="answer-option" key={option.label}><input type="radio" name={question.id} checked={answers[question.id] === option.label} onChange={() => setAnswers({ ...answers, [question.id]: option.label })} /><div>{option.label}<small>{option.description}</small></div></label>)}<input className="full-input" aria-label={`Your answer: ${question.header}`} placeholder="Or write your answer…" value={question.options?.some(o => o.label === answers[question.id]) ? '' : answers[question.id] || ''} onChange={e => setAnswers({ ...answers, [question.id]: e.target.value })} /></fieldset>)}
    {isMcp ? <><p>This version cannot complete external tool forms. You can decline this request and continue the conversation.</p><button className="secondary-button" disabled={busy} onClick={() => respond('decline')}>Decline request</button></> : <div className="button-row">{!isQuestion && <button className="secondary-button" disabled={busy} onClick={() => respond('decline')}>Deny</button>}<button className="primary-button" disabled={busy || (isQuestion && questions.some(q => !answers[q.id]?.trim()))} onClick={() => respond('accept')}>{busy ? 'Sending…' : isQuestion ? 'Send answer' : 'Allow once'}</button></div>}
  </div>;
}
