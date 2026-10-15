import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';
import { copy, desktop, openExternal } from './api';
function CodeBlock({ children }: { children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const element = children as React.ReactElement<{ children?: string; className?: string }>;
  const text = String(element?.props?.children || '').replace(/\n$/, '');
  const language = element?.props?.className?.replace('language-', '') || 'Code';
  return <div className="code-block"><div className="code-header"><span>{language}</span><button onClick={() => { copy(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }); }}><span>{copied ? 'Copied' : 'Copy'}</span>{copied ? <Check size={13} /> : <Copy size={13} />}</button></div><pre>{children}</pre></div>;
}
export function Markdown({ text, onFile, onError }: { text: string; onFile?: (path: string) => void; onError?: (message: string) => void }) {
  const [linkError, setLinkError] = useState('');
  return <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
    a: ({ href, children }) => {
      const url = href?.startsWith('//') ? `https:${href}` : href;
      const external = !!url && /^(https?:|mailto:|tel:)/i.test(url);
      const local = href && !external && (href.startsWith('/') || href.startsWith('./') || href.startsWith('../'));
      if (local && onFile) return <button className="file-link" onClick={() => onFile(href)}>{children}</button>;
      const open = (event: React.MouseEvent<HTMLAnchorElement>) => {
        if (!desktop || !external || !url) return;
        event.preventDefault();
        setLinkError('');
        void openExternal(url).catch(() => {
          const message = 'Could not open the link. Copy its address and open it in your browser.';
          if (onError) onError(message); else setLinkError(message);
        });
      };
      return <a href={url} target="_blank" rel="noopener noreferrer" onClick={open} onAuxClick={event => { if (event.button === 1) open(event); }}>{children}</a>;
    },
  }}>{text}</ReactMarkdown>{linkError && <p className="inline-error" role="alert">{linkError}</p>}</div>;
}
