import {
  Pipeline,
  JsonStore,
  createLlm,
  createContent,
  createEngagementTracker,
  PersonaRegistry,
  type Content,
  type EngagementMetric,
  emptyFeedback,
  appendFeedback,
  filterByWindow,
  type FeedbackState,
} from '@ima/core';
import { createCrawler } from '@ima/crawler';
import { createRegistry } from '@ima/publisher';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QueueStore } from './queue-store.js';

export interface AppContext {
  store: JsonStore;
  llm: ReturnType<typeof createLlm>;
  crawler: ReturnType<typeof createCrawler>;
  registry: ReturnType<typeof createRegistry>;
  pipeline: Pipeline;
  personas: PersonaRegistry;
  queue: QueueStore;
  now: () => string;
}

export function createApp(): AppContext {
  const store = new JsonStore();
  const llm = createLlm();
  const crawler = createCrawler({ prefer: 'mock' });
  const registry = createRegistry();
  const personas = loadPersonas(store);
  const now = (): string => new Date().toISOString();
  const queue = new QueueStore(store);

  const feedback = loadFeedbackSync(store, now);

  const pipeline = new Pipeline(
    {
      llm,
      crawler,
      publisher: {
        post: (platform, content) => registry.get(platform).post(content),
        healthCheck: (platform) => registry.get(platform).healthCheck(),
      },
      queueSink: async (item) => { await queue.write(item); },
      now,
    },
    {
      ideaCount: 4,
      maxRevisionRounds: 2,
      feedback,
      personaLookup: (id) => personas.get(id),
      translateTargets: ['en', 'ja'],
    },
  );
  return { store, llm, crawler, registry, pipeline, personas, queue, now };
}

function loadPersonas(store: JsonStore): PersonaRegistry {
  const reg = new PersonaRegistry();
  const defaultPersona = {
    id: 'default',
    name: '通用大 V',
    tone: 'professional + warm',
    targetAudience: '中文互联网用户',
    signaturePhrases: ['评论区聊聊', '亲测有效'],
    bannedWords: ['震惊', '不转不是'],
    defaultPlatforms: ['x', 'xiaohongshu', 'weibo', 'bilibili', 'reddit'],
    examples: [
      '【大 V 视角】AI Agent 趋势：3 个被低估的真相',
      '为什么大家突然都在聊 agent？核心信号有 3 个',
    ],
    createdAt: '2026-06-20T00:00:00.000Z',
    updatedAt: '2026-06-20T00:00:00.000Z',
  };
  reg.upsert(defaultPersona);

  const techPersona = {
    id: 'tech-insight',
    name: '技术洞察家',
    tone: 'analytical + concise',
    targetAudience: '开发者和技术决策者',
    signaturePhrases: ['技术要点', '实测数据', '代码示例'],
    bannedWords: ['震惊', '小白', '速来'],
    defaultPlatforms: ['x', 'reddit', 'bilibili'],
    examples: [
      '实测 5 个 agent 框架后，我的选型逻辑变了',
      'B 站科技区爆款规律：标题、配乐、剪辑',
    ],
    createdAt: '2026-06-20T00:00:00.000Z',
    updatedAt: '2026-06-20T00:00:00.000Z',
  };
  reg.upsert(techPersona);

  const lifestylePersona = {
    id: 'lifestyle',
    name: '生活方式博主',
    tone: 'casual + intimate',
    targetAudience: '年轻女性',
    signaturePhrases: ['姐妹们', '真心安利', '闭眼入'],
    bannedWords: ['油腻', '爹味'],
    defaultPlatforms: ['xiaohongshu', 'weibo'],
    examples: [
      '小红书种草心得：从 0 到 1 万粉',
      '真心安利这 5 个小众好物',
    ],
    createdAt: '2026-06-20T00:00:00.000Z',
    updatedAt: '2026-06-20T00:00:00.000Z',
  };
  reg.upsert(lifestylePersona);

  const personasPath = join(store.root, 'personas.json');
  if (existsSync(personasPath)) {
    try {
      const persisted = JSON.parse(readFileSync(personasPath, 'utf-8')) as Record<string, unknown>;
      for (const v of Object.values(persisted)) {
        if (v && typeof v === 'object') reg.upsert(v as Parameters<PersonaRegistry['upsert']>[0]);
      }
    } catch {
      // ignore corrupted persona files and keep defaults available
    }
  }
  return reg;
}

/** Synchronously load feedback state from storage; returns empty if no file. */
function loadFeedbackSync(store: JsonStore, now: () => string): EngagementMetric[] {
  const p = join(store.root, 'feedback.json');
  if (!existsSync(p)) return [];
  try {
    const raw = readFileSync(p, 'utf-8');
    const state = JSON.parse(raw) as FeedbackState;
    return filterByWindow(state.records, state.windowDays, now());
  } catch {
    return [];
  }
}

export async function saveContent(store: JsonStore, c: Content): Promise<void> {
  await store.write(`content/${c.id}.json`, c);
}

export async function loadContent(store: JsonStore, id: string): Promise<Content | null> {
  return store.read<Content>(`content/${id}.json`);
}

export async function listContentIds(store: JsonStore): Promise<string[]> {
  const files = await store.list('content');
  return files.filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
}

export function createContentFor(topic: string, persona?: string): Content {
  return createContent({ id: `c-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`, topic, ...(persona ? { persona } : {}) });
}

export async function savePersonas(store: JsonStore, reg: PersonaRegistry): Promise<void> {
  const map: Record<string, unknown> = {};
  for (const p of reg.list()) map[p.id] = p;
  await store.write('personas.json', map);
}

export async function fetchAndAppendEngagement(
  store: JsonStore,
  contents: Content[],
  now: () => string = () => new Date().toISOString(),
): Promise<{ metrics: EngagementMetric[]; saved: number }> {
  const tracker = createEngagementTracker();
  const metrics: EngagementMetric[] = [];
  for (const c of contents) {
    for (const post of c.posts) {
      if (!post.postId) continue;
      try {
        const m = await tracker.fetch(post.platform, post.postId);
        metrics.push(m);
        c.engagement.push(m);
      } catch {
        // skip
      }
    }
    if (c.posts.length > 0) {
      await saveContent(store, c);
    }
  }

  // persist feedback.json with window filter
  const stateRaw = await store.read<FeedbackState>('feedback.json');
  const cur: FeedbackState = stateRaw ?? emptyFeedback(now());
  const merged = appendFeedback(cur, metrics, now());
  await store.write('feedback.json', merged);

  return { metrics, saved: merged.records.length };
}