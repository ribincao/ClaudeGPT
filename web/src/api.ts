import { invoke, isTauri, convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
export const desktop = isTauri();
export async function api<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
  if (desktop) {
    try { return await invoke<T>('request', { path, method, body: body ?? null }); }
    catch (error) { throw new Error(String(error)); }
  }
  const response = await fetch(`/api${path}`, {
    method, headers: { 'Content-Type': 'application/json', 'X-ClaudeX-Client': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The request failed. Please try again.');
  return result;
}
export const folderName = (value: string) => value.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) || 'Workspace';
export const modelName = (value: string) => value.replace(/^gpt-/i, 'GPT ').replace(/-/g, ' ').replace(/\b(sol|astra|luna|terra)\b/g, word => word[0].toUpperCase() + word.slice(1));
export function download(name: string, text: string, type = 'text/markdown') {
  if (desktop) { void invoke('save_text', { name, content: text }); return; }
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function copy(text: string) { if (desktop) await writeText(text); else await navigator.clipboard.writeText(text); }
export function attachmentUrl(id: string) { return desktop ? convertFileSrc(id, 'claudex') : `/api/uploads/${id}`; }
export async function openExternal(url: string) { if (desktop) await openUrl(url); else window.open(url, '_blank', 'noopener,noreferrer'); }
export function subscribeEvents(receive: (event: any) => void, connection: (connected: boolean) => void) {
  let canceled = false;
  if (desktop) {
    const subscription = listen('claudex-event', event => receive(event.payload));
    connection(true);
    return () => { canceled = true; void subscription.then(unlisten => unlisten()); };
  }
  let socket: WebSocket, retry: ReturnType<typeof setTimeout>;
  const connect = () => {
    if (canceled) return;
    socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/events`);
    socket.onopen = () => connection(true);
    socket.onmessage = event => receive(JSON.parse(event.data));
    socket.onclose = () => { if (!canceled) { connection(false); retry = setTimeout(connect, 2000); } };
  };
  connect();
  return () => { canceled = true; clearTimeout(retry); socket?.close(); };
}

export async function setPageZoom(factor: number) {
  if (desktop) await invoke('set_page_zoom', { factor });
}
