import {
  Pipeline,
  JsonStore,
  createLlm,
  createContent,
  type Content,
} from '@ima/core';
import { createCrawler } from '@ima/crawler';
import { createRegistry } from '@ima/publisher';

export interface AppContext {
  store: JsonStore;
  llm: ReturnType<typeof createLlm>;
  crawler: ReturnType<typeof createCrawler>;
  registry: ReturnType<typeof createRegistry>;
  pipeline: Pipeline;
  now: () => string;
}

export function createApp(): AppContext {
  const store = new JsonStore();
  const llm = createLlm();
  const crawler = createCrawler({ prefer: 'mock' });
  const registry = createRegistry();
  const now = (): string => new Date().toISOString();
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
    { ideaCount: 4, maxRevisionRounds: 2 },
  );
  return { store, llm, crawler, registry, pipeline, now };
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