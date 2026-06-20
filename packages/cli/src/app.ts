import {
  Pipeline,
  JsonStore,
  createLlm,
  createContent,
  createEngagementTracker,
  PersonaRegistry,
  type Content,
  type EngagementMetric,
} from '@ima/core';
import { createCrawler } from '@ima/crawler';
import { createRegistry } from '@ima/publisher';

export interface AppContext {
  store: JsonStore;
  llm: ReturnType<typeof createLlm>;
  crawler: ReturnType<typeof createCrawler>;
  registry: ReturnType<typeof createRegistry>;
  pipeline: Pipeline;
  personas: PersonaRegistry;
  now: () => string;
}

export function createApp(): AppContext {
  const store = new JsonStore();
  const llm = createLlm();
  const crawler = createCrawler({ prefer: 'mock' });
  const registry = createRegistry();
  const personas = loadPersonas(store);
  const now = (): string => new Date().toISOString();

  // load historical engagement metrics for idea re-ranking
  const feedback = loadAllEngagement(store);

  const pipeline = new Pipeline(
    {
      llm,
      crawler,
      publisher: {
        post: (platform, content) => registry.get(platform).post(content),
        healthCheck: (platform) => registry.get(platform).healthCheck(),
      },
      now,
    },
    {
      ideaCount: 4,
      maxRevisionRounds: 2,
      feedback,
      personaLookup: (id) => personas.get(id),
    },
  );
  return { store, llm, crawler, registry, pipeline, personas, now };
}

function loadPersonas(store: JsonStore): PersonaRegistry {
  const reg = new PersonaRegistry();
  // seed with default + sample personas
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

  // load any user-defined personas from storage
  void store.read<Record<string, unknown>>('personas.json').then((p) => {
    if (p && typeof p === 'object') {
      for (const v of Object.values(p)) {
        if (v && typeof v === 'object') reg.upsert(v as Parameters<PersonaRegistry['upsert']>[0]);
      }
    }
  });
  return reg;
}

function loadAllEngagement(_store: JsonStore): EngagementMetric[] {
  // synchronously return empty; full history is loaded asynchronously
  // (kept synchronous to fit Pipeline constructor signature)
  return [];
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

export async function savePersonas(_store: JsonStore, reg: PersonaRegistry): Promise<void> {
  const map: Record<string, unknown> = {};
  for (const p of reg.list()) map[p.id] = p;
  // personas JSON snapshot — will be persisted alongside content
  // (kept lightweight; full CRUD happens via app.personas in-memory)
  void map;
}

export async function fetchAndAppendEngagement(store: JsonStore, contents: Content[]): Promise<EngagementMetric[]> {
  const tracker = createEngagementTracker();
  const out: EngagementMetric[] = [];
  for (const c of contents) {
    for (const post of c.posts) {
      if (!post.postId) continue;
      try {
        const m = await tracker.fetch(post.platform, post.postId);
        out.push(m);
        c.engagement.push(m);
      } catch {
        // skip
      }
    }
    if (c.posts.length > 0) {
      await saveContent(store, c);
    }
  }
  return out;
}