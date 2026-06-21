import type { JsonStore, QueueItem } from '@ima/core';
import { existsSync } from 'node:fs';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Persistence for the publish queue. Each item is its own JSON file under
 * `.ima/queue/<id>.json`. The store never has to know about queue internals;
 * we treat it as a flat key-value namespace with a `queue` subdirectory.
 */
export class QueueStore {
  constructor(private readonly store: JsonStore) {}

  async write(item: QueueItem): Promise<void> {
    await this.store.write(`queue/${item.id}.json`, item);
  }

  async read(rel: string): Promise<QueueItem | null> {
    return this.store.read<QueueItem>(`queue/${rel}.json`);
  }

  async list(): Promise<QueueItem[]> {
    const dir = this.store.path('queue');
    if (!existsSync(dir)) return [];
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    const out: QueueItem[] = [];
    for (const f of files) {
      const raw = readFileSync(join(dir, f), 'utf-8');
      if (!raw.trim()) continue;
      try {
        out.push(JSON.parse(raw) as QueueItem);
      } catch {
        // skip corrupted rows
      }
    }
    return out;
  }

  async remove(id: string): Promise<void> {
    await this.store.remove(`queue/${id}.json`);
  }

  async replaceAll(items: QueueItem[]): Promise<void> {
    // Persist the new state. Caller already mutated `items` in place; we just
    // need to write each one back.
    for (const it of items) {
      await this.write(it);
    }
  }
}
