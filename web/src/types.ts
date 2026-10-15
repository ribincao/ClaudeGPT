export type Settings = {
  theme: 'dark' | 'light' | 'system'; font: 'serif' | 'sans'; textSize: 'small' | 'medium' | 'large';
  width: 'narrow' | 'medium' | 'wide'; reducedMotion: boolean; displayName: string; enterToSend: boolean;
  model: string; effort: string; workspace: string; approvalPolicy: string; customInstructions: string; enginePath?: string;
};
export type Attachment = { id: string; name: string; type: string };
export type Item = {
  id: string; type: string; text?: string; content?: { type: string; text?: string; url?: string }[];
  attachments?: Attachment[]; command?: string; aggregatedOutput?: string; status?: string;
  exitCode?: number; changes?: { path: string; kind?: { type: string }; diff?: string }[];
  tool?: string; server?: string; result?: unknown; turnId?: string;
};
export type Chat = {
  id: string; title: string; workspace: string; mode: 'chat' | 'work'; items: Item[];
  createdAt: number; updatedAt: number; status: string; activeTurnId?: string | null;
  projectId?: string | null; recencyAt?: number; threadId?: string; pinned: boolean; archived: boolean; error?: string | null;
  model?: string; effort?: string; plan?: { step: string; status: string }[];
  tokenUsage?: { total?: { totalTokens: number }; last?: { totalTokens: number } };
};
export type Model = { id: string; model: string; displayName: string; description: string; isDefault: boolean; defaultReasoningEffort: string; supportedReasoningEfforts: { reasoningEffort: string; description: string }[] };
export type Approval = { id: string; method: string; params: { threadId: string; reason?: string; command?: string; permissions?: unknown; questions?: { id: string; header: string; question: string; options?: { label: string; description: string }[] }[]; [key: string]: unknown } };
export type CodexProject = { id: string; name: string; roots: { path: string }[] };
export type State = { projects?: CodexProject[]; historyWarning?: string | null; settings: Settings; chats: Chat[]; workspaces: string[]; models: Model[]; account: { type: string; email?: string; planType?: string } | null; connected: boolean; engineError: string | null; approvals: Approval[] };
export type Skill = { name: string; description: string; path: string; enabled?: boolean; shortDescription?: string };
