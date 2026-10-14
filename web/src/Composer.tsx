import { useEffect, useRef, useState } from 'react';
import { Plus, ArrowUp, Square, ChevronDown, Check, X, FolderOpen, FileText, LoaderCircle, Paperclip, Sparkles } from 'lucide-react';
import { api, folderName, modelName, attachmentUrl } from './api';
import type { Attachment, Settings, Model, Skill } from './types';

export function Composer({ value, setValue, onSend, onStop, busy, running, settings, models, mode, setMode, workspace, onWorkspace, onSave, toast, connected, selectedSkill, clearSkill, openSkills, draftKey }: {
  value: string; setValue: (value: string) => void; onSend: (attachments: Attachment[]) => Promise<boolean>;
  onStop: () => void; busy: boolean; running: boolean; settings: Settings; models: Model[];
  mode: 'chat' | 'work'; setMode: (mode: 'chat' | 'work') => void; workspace: string; onWorkspace: () => void;
  onSave: (s: Partial<Settings>) => void; toast: (message: string) => void; connected: boolean;
  selectedSkill: Skill | null; clearSkill: () => void; openSkills: () => void; draftKey: string;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null), fileInput = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const previousDraft = useRef(draftKey);
  const [picker, setPicker] = useState(false), [attachMenu, setAttachMenu] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]), [uploading, setUploading] = useState(false), [dragging, setDragging] = useState(false);
  const model = models.find(m => (m.model || m.id) === settings.model);
  useEffect(() => { if (textarea.current) { textarea.current.style.height = 'auto'; textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 240)}px`; } }, [value]);
  useEffect(() => {
    const startingConversation = previousDraft.current === 'new' && busy;
    if (!startingConversation) setAttachments([]);
    previousDraft.current = draftKey;
  }, [draftKey]);
  useEffect(() => {
    const outside = (e: MouseEvent) => { if (menu.current && !menu.current.contains(e.target as Node)) { setPicker(false); setAttachMenu(false); } };
    document.addEventListener('mousedown', outside); return () => document.removeEventListener('mousedown', outside);
  }, []);
  async function upload(files: FileList | File[]) {
    setUploading(true);
    try {
      const uploaded: Attachment[] = [];
      for (const file of [...files].slice(0, 8 - attachments.length)) {
        if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} is too large. Each file must be under 10 MB.`);
        const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
        uploaded.push(await api('/uploads', 'POST', { name: file.name, type: file.type, data }));
      }
      setAttachments(previous => [...previous, ...uploaded]);
    } catch (error) { toast((error as Error).message); } finally { setUploading(false); }
  }
  async function send() {
    if (busy || running || uploading || !connected || (!value.trim() && !attachments.length)) return;
    if (await onSend(attachments)) setAttachments([]);
  }
  return <div className={`composer ${dragging ? 'dragging' : ''}`} ref={menu} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }} onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}>
    {dragging && <div className="drop-label"><Paperclip size={22} />Drop files here</div>}
    {(attachments.length > 0 || selectedSkill) && <div className="composer-attachments">
      {selectedSkill && <div className="attachment-chip skill-chip"><Sparkles size={16} /><span>{selectedSkill.name}</span><button aria-label="Remove selected skill" onClick={clearSkill}><X size={13} /></button></div>}
      {attachments.map(file => <div className="attachment-chip" key={file.id}>{file.type.startsWith('image/') ? <img src={attachmentUrl(file.id)} alt="" /> : <FileText size={18} />}<span>{file.name}</span><button aria-label={`Remove ${file.name}`} onClick={() => setAttachments(attachments.filter(a => a.id !== file.id))}><X size={13} /></button></div>)}
    </div>}
    <textarea ref={textarea} aria-label="Message Codex" placeholder={connected ? 'How can I help you today?' : 'Your space to think. Connect Codex to get started.'} value={value} rows={2} onChange={e => setValue(e.target.value)} onKeyDown={e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && (settings.enterToSend || e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
      if (e.key === 'Escape') { setPicker(false); setAttachMenu(false); }
    }} onPaste={e => { if (e.clipboardData.files.length) { e.preventDefault(); upload(e.clipboardData.files); } }} />
    <div className="composer-toolbar">
      <div className="composer-left">
        <div className="menu-anchor"><button className="icon-button add-button" aria-label="Add attachment or skill" aria-expanded={attachMenu} onClick={() => { setAttachMenu(!attachMenu); setPicker(false); }}><Plus size={23} strokeWidth={1.6} /></button>
          {attachMenu && <div className="popup attach-popup"><button onClick={() => { fileInput.current?.click(); setAttachMenu(false); }}><Paperclip size={17} />Attach files<span>⌘ V</span></button><button onClick={() => { openSkills(); setAttachMenu(false); }}><Sparkles size={17} />Use a skill</button><button onClick={() => { onWorkspace(); setAttachMenu(false); }}><FolderOpen size={17} />Choose workspace</button><p>Images, text, and source files · up to 10 MB</p></div>}
        </div>
        <div className="mode-switch" role="group" aria-label="Conversation mode"><button className={mode === 'chat' ? 'active' : ''} onClick={() => setMode('chat')} title="Read and discuss your workspace">Chat</button><button className={mode === 'work' ? 'active' : ''} onClick={() => setMode('work')} title="Edit files in your workspace">Work</button></div>
        <button className="workspace-chip" title={workspace} onClick={onWorkspace}><FolderOpen size={15} /><span>{folderName(workspace)}</span></button>
      </div>
      <div className="composer-right">
        {uploading && <LoaderCircle size={18} className="spinning" aria-label="Uploading files" />}
        <div className="menu-anchor model-anchor"><button className="model-button" aria-label="Choose model and reasoning effort" aria-expanded={picker} onClick={() => { setPicker(!picker); setAttachMenu(false); }}><span>{model?.displayName || modelName(settings.model) || 'Choose model'}</span><span className="effort-label">{settings.effort.charAt(0).toUpperCase() + settings.effort.slice(1)}</span><ChevronDown size={14} /></button>
          {picker && <div className="popup model-popup"><div className="popup-heading">Model</div>{models.length ? models.map(m => <button className="model-option" key={m.id} onClick={() => onSave({ model: m.model || m.id, effort: m.defaultReasoningEffort })}><div><span>{m.displayName || modelName(m.model || m.id)}</span><small>{m.description}</small></div>{(m.model || m.id) === settings.model && <Check size={16} />}</button>) : <p>No models available. Reconnect in Settings.</p>}
            <div className="popup-heading reasoning-heading">Reasoning effort</div><div className="effort-options">{model?.supportedReasoningEfforts?.map(option => <button title={option.description} className={option.reasoningEffort === settings.effort ? 'active' : ''} key={option.reasoningEffort} onClick={() => onSave({ effort: option.reasoningEffort })}>{option.reasoningEffort.charAt(0).toUpperCase() + option.reasoningEffort.slice(1)}</button>)}</div>
          </div>}
        </div>
        {running ? <button className="send-button stop-button" title="Stop response" aria-label="Stop response" onClick={onStop}><Square size={15} fill="currentColor" /></button> : <button className="send-button" aria-label="Send message" title="Send message" disabled={busy || uploading || !connected || (!value.trim() && !attachments.length)} onClick={send}>{busy ? <LoaderCircle className="spinning" size={18} /> : <ArrowUp size={20} />}</button>}
      </div>
    </div>
    <input ref={fileInput} className="visually-hidden" type="file" multiple aria-label="Attach files" accept="image/png,image/jpeg,image/webp,image/gif,.txt,.md,.csv,.json,.js,.ts,.tsx,.jsx,.py,.html,.css,.yaml,.yml,.toml,.xml,.sql,.sh,.log" onChange={e => { if (e.target.files) upload(e.target.files); e.target.value = ''; }} />
  </div>;
}
