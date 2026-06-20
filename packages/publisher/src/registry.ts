import type { PlatformId, PostRecord } from '@ima/core/types';
import type { Channel, PostInput } from './channels.js';
import {
  XChannel,
  XiaohongshuChannel,
  WeiboChannel,
  BilibiliChannel,
  RedditChannel,
} from './channels.js';

export class ChannelRegistry {
  private readonly map = new Map<PlatformId, Channel>();

  constructor() {
    this.register(new XChannel());
    this.register(new XiaohongshuChannel());
    this.register(new WeiboChannel());
    this.register(new BilibiliChannel());
    this.register(new RedditChannel());
  }

  register(c: Channel): void {
    this.map.set(c.id, c);
  }

  get(id: PlatformId): Channel {
    const c = this.map.get(id);
    if (!c) throw new Error(`channel not registered: ${id}`);
    return c;
  }

  has(id: PlatformId): boolean {
    return this.map.has(id);
  }

  ids(): PlatformId[] {
    return Array.from(this.map.keys());
  }

  async postAll(input: PostInput): Promise<PostRecord[]> {
    const out: PostRecord[] = [];
    for (const c of this.map.values()) {
      try {
        out.push(await c.post(input));
      } catch (e) {
        out.push({
          platform: c.id,
          postId: null,
          status: 'failed',
          error: (e as Error).message,
          postedAt: new Date().toISOString(),
        });
      }
    }
    return out;
  }

  async doctor(): Promise<Array<{ id: PlatformId; ok: boolean; detail: string }>> {
    const out: Array<{ id: PlatformId; ok: boolean; detail: string }> = [];
    for (const c of this.map.values()) {
      const r = await c.healthCheck();
      out.push({ id: c.id, ok: r.ok, detail: r.detail });
    }
    return out;
  }
}

export function createRegistry(): ChannelRegistry {
  return new ChannelRegistry();
}