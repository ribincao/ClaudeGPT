import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';
import { copy } from './api';
function CodeBlock({ children }: { children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const element = children as React.ReactElement<{ children?: string; className?: string }>;
  const text = String(element?.props?.children || '').replace(/\n$/, '');
  const language = element?.props?.className?.replace('language-', '') || 'Code';
  return <div className="code-block"><div className="code-header"><span>{language}</span><button onClick={() => { copy(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }); }}><span>{copied ? 'Copied' : 'Copy'}</span>{copied ? <Check size={13} /> : <Copy size={13} />}</button></div><pre>{children}</pre></div>;
}
export function Markdown({ text, onFile }: { text: string; onFile?: (path: string) => void }) {
  return <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
    a: ({ href, children }) => {
      const local = href && (href.startsWith('/') || href.startsWith('./'));
      if (local && onFile) return <button className="file-link" onClick={() => onFile(href)}>{children}</button>;
      return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
    },
  }}>{text}</ReactMarkdown></div>;
}
