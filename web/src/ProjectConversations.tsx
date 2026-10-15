import { useState, type ReactNode } from 'react';
import { ChevronDown, FolderOpen } from 'lucide-react';
import type { Chat, CodexProject } from './types';

export function ProjectConversations({ projects, chats, renderChat }: { projects: CodexProject[]; chats: Chat[]; renderChat: (chat: Chat) => ReactNode }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const projectIds = new Set(projects.map(p => p.id));
  const recents = chats.filter(chat => !chat.projectId || !projectIds.has(chat.projectId));
  return <>
    {projects.map(project => {
      const items = chats.filter(chat => chat.projectId === project.id);
      const shown = expanded[project.id] ? items : items.slice(0, 5);
      return <details className="project-conversations" key={project.id} open>
        <summary><FolderOpen size={16} /><span>{project.name}</span></summary>
        <div className="project-chat-list">{shown.map(chat => <div key={chat.id}>{renderChat(chat)}</div>)}
          {!items.length && <p className="sidebar-empty">No conversations yet.</p>}
          {items.length > 5 && <button className="project-show-more" onClick={() => setExpanded(previous => ({ ...previous, [project.id]: !previous[project.id] }))}>{expanded[project.id] ? 'Show less' : 'Show more'}</button>}
        </div>
      </details>;
    })}
    <details className="recent-conversations"><summary>Recents <ChevronDown size={14} /><span>{recents.length || ''}</span></summary>
      {recents.map(chat => <div key={chat.id}>{renderChat(chat)}</div>)}
      {!recents.length && <p className="sidebar-empty">No recent conversations.</p>}
    </details>
  </>;
}
