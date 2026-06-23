import type { Content, ContentStage, HistoryEntry } from './types.js';

export interface WebConsoleSnapshotInput {
  stats: { totalContents: number; totalQueue: number; queueByStatus?: Record<string, number> };
  queue: Array<{ id: string; status: string; platform: string }>;
}

export interface WebConsoleSnapshot {
  tabs: string[];
  actions: string[];
  badges: { contents: number; queue: number; pending: number };
}

export type BulkActionKind = 'pause' | 'resume' | 'retry' | 'cancel';

export interface BulkContentAction {
  kind: BulkActionKind;
  where: { stage?: ContentStage; ids?: string[] };
  now: string;
}

export interface BulkContentResult {
  contents: Content[];
  changed: number;
  audit: HistoryEntry[];
}

export function buildWebConsoleSnapshot(input: WebConsoleSnapshotInput): WebConsoleSnapshot {
  return {
    tabs: ['contents', 'stats', 'queue', 'feedback', 'llm'],
    actions: ['run-topic', 'queue-work', 'pause', 'resume', 'retry', 'cancel'],
    badges: {
      contents: input.stats.totalContents,
      queue: input.stats.totalQueue,
      pending: input.stats.queueByStatus?.['pending'] ?? input.queue.filter((item) => item.status === 'pending').length,
    },
  };
}

export function reduceBulkContentAction(contents: readonly Content[], action: BulkContentAction): BulkContentResult {
  const idSet = new Set(action.where.ids ?? []);
  const audit: HistoryEntry[] = [];
  const next = contents.map((content) => {
    const matchesStage = action.where.stage ? content.stage === action.where.stage : true;
    const matchesId = idSet.size > 0 ? idSet.has(content.id) : true;
    if (!matchesStage || !matchesId) return cloneContent(content);
    const from = content.stage;
    const to = nextStage(from, action.kind);
    if (to === from) return cloneContent(content);
    const updated = { ...cloneContent(content), stage: to, updatedAt: action.now };
    const entry: HistoryEntry = { from, to, agent: 'bulk-control', at: action.now, note: `${action.kind} content ${content.id}` };
    updated.history = [...updated.history, entry];
    audit.push(entry);
    return updated;
  });
  return { contents: next, changed: audit.length, audit };
}

function nextStage(stage: ContentStage, kind: BulkActionKind): ContentStage {
  if (kind === 'pause') return stage === 'done' ? 'done' : 'needs_revision';
  if (kind === 'resume') return stage === 'needs_revision' ? 'review' : stage;
  if (kind === 'retry') return stage === 'needs_revision' ? 'draft' : stage;
  if (kind === 'cancel') return 'needs_revision';
  return stage;
}

function cloneContent(content: Content): Content {
  return {
    ...content,
    sources: [...content.sources],
    ideas: [...content.ideas],
    posts: [...content.posts],
    history: [...content.history],
    engagement: [...content.engagement],
  };
}
