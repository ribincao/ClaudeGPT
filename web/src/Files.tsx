import { useCallback, useEffect, useState } from 'react';
import { X, Folder, FileText, ChevronRight, ChevronLeft, RefreshCw, ArrowUpRight, LoaderCircle, Copy, Check, Plus } from 'lucide-react';
import { api, folderName, copy } from './api';
import { Markdown } from './Markdown';
export function Files({ workspace, initialFile, close, addToMessage }: { workspace: string; initialFile: string | null; close: () => void; addToMessage: (path: string) => void }) {
  const [directory, setDirectory] = useState(''), [entries, setEntries] = useState<{ name: string; path: string; directory: boolean }[]>([]);
  const [file, setFile] = useState<{ content: string; name: string; size: number; path: string } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [raw, setRaw] = useState(false), [copied, setCopied] = useState(false);
  const load = useCallback(async (relative = '') => {
    setBusy(true); setError(''); setFile(null);
    try { const data = await api(`/files?workspace=${encodeURIComponent(workspace)}&path=${encodeURIComponent(relative)}`); setEntries(data.files); setDirectory(data.path); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }, [workspace]);
  const openFile = useCallback(async (relative: string) => {
    setBusy(true); setError('');
    try {
      const normalized = relative.startsWith(workspace + '/') ? relative.slice(workspace.length + 1) : relative.replace(/^\.\//, '').replace(/:\d+$/, '');
      const data = await api(`/file?workspace=${encodeURIComponent(workspace)}&path=${encodeURIComponent(normalized)}`);
      setFile({ ...data, path: normalized }); setRaw(!/\.md$/i.test(data.name));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }, [workspace]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (initialFile) openFile(initialFile); }, [initialFile, openFile]);
  return <aside className="files-panel" aria-label="Workspace files"><header><div><Folder size={17} /><span>{folderName(workspace)}</span></div><div><button className="icon-button" aria-label="Refresh files" onClick={() => load(directory)}><RefreshCw size={16} /></button><button className="icon-button" aria-label="Close files" onClick={close}><X size={19} /></button></div></header>
    <div className="files-breadcrumb"><button onClick={() => file ? setFile(null) : load(directory.split('/').slice(0, -1).join('/'))} disabled={!file && !directory}><ChevronLeft size={15} /></button><span title={file?.path || directory}>{file?.name || directory || 'Files'}</span></div>
    {busy && <div className="panel-loading"><LoaderCircle size={20} className="spinning" /></div>}
    {error && <div className="panel-error"><p>{error}</p><button className="text-button" onClick={() => load(directory)}>Back to files</button></div>}
    {!busy && !error && file && <><div className="preview-toolbar"><span>{(file.size / 1024).toFixed(1)} KB</span><div><button className="icon-button" title={raw ? 'Rendered preview' : 'View source'} aria-label="Toggle source preview" onClick={() => setRaw(!raw)}><FileText size={15} /></button><button className="icon-button" aria-label="Copy file contents" onClick={() => copy(file.content).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); })}>{copied ? <Check size={15} /> : <Copy size={15} />}</button></div></div><div className="file-preview">{raw ? <pre>{file.content}</pre> : <Markdown text={file.content} onFile={openFile} />}</div><button className="secondary-button add-file-message" onClick={() => addToMessage(file.path)}><Plus size={15} />Mention in message</button></>}
    {!busy && !error && !file && <div className="file-entries">{entries.length ? entries.map(entry => <button key={entry.path} onClick={() => entry.directory ? load(entry.path) : openFile(entry.path)}>{entry.directory ? <Folder size={17} /> : <FileText size={17} />}<span>{entry.name}</span>{entry.directory ? <ChevronRight size={14} /> : <ArrowUpRight size={13} />}</button>) : <p className="muted">This folder is empty.</p>}</div>}
  </aside>;
}
