import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
export function Modal({ title, close, children, className = '' }: { title: string; close: () => void; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const dialog = ref.current!;
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, textarea, a[href], [tabindex="0"]')].filter(el => el.offsetParent !== null);
    (focusable()[0] || dialog).focus();
    function key(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.stopPropagation(); close(); }
      if (event.key === 'Tab') {
        const elements = focusable(); const first = elements[0], last = elements.at(-1);
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    dialog.addEventListener('keydown', key);
    return () => { dialog.removeEventListener('keydown', key); previous?.focus(); };
  }, [close]);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={`modal ${className}`}>
      <button className="icon-button modal-close" aria-label={`Close ${title}`} onClick={close}><X size={21} /></button>
      {children}
    </div>
  </div>;
}
