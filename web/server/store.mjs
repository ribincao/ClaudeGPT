import fs from 'node:fs';
import path from 'node:path';

export const defaultSettings = {
  theme: 'dark', font: 'serif', textSize: 'medium', width: 'medium', reducedMotion: false,
  displayName: 'Ribin', enterToSend: true, model: '', effort: 'medium',
  workspace: '', approvalPolicy: 'on-request', customInstructions: '',
};

export class Store {
  constructor(directory, workspace) {
    this.directory = directory;
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.file = path.join(directory, 'state.json');
    this.state = { settings: { ...defaultSettings, workspace }, chats: [], workspaces: [workspace] };
    if (fs.existsSync(this.file)) {
      try {
        const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        this.state = { ...this.state, ...saved, settings: { ...this.state.settings, ...saved.settings } };
      } catch {
        fs.copyFileSync(this.file, `${this.file}.backup-${Date.now()}`);
      }
    }
    for (const chat of this.state.chats) {
      if (chat.status === 'running') chat.status = 'interrupted';
      chat.activeTurnId = null;
    }
    this.save();
  }
  save() {
    clearTimeout(this.timer);
    const temp = `${this.file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    fs.renameSync(temp, this.file);
  }
  schedule() { clearTimeout(this.timer); this.timer = setTimeout(() => this.save(), 200); }
  chat(id) {
    const chat = this.state.chats.find(c => c.id === id);
    if (!chat) throw Object.assign(new Error('This conversation could not be found.'), { status: 404 });
    return chat;
  }
}
