import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { desktop, openExternal } from './api';
if (desktop) document.addEventListener('click', event => {
  const anchor = (event.target as HTMLElement).closest('a');
  if (anchor && /^https?:\/\//.test(anchor.href) && !anchor.href.startsWith('http://claudex.localhost')) { event.preventDefault(); void openExternal(anchor.href); }
});
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
