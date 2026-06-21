import type { PlatformId, PostRecord } from '@ima/core/types';
import type { Channel, PostInput } from './channels.js';
import {
  XChannel,
  XiaohongshuChannel,
  WeiboChannel,
  BilibiliChannel,
  RedditChannel,
  YoutubeChannel,
} from './channels.js';
import {
  createRealChannel,
  type CreateRealChannelOptions,
} from './real-channels.js';

export class ChannelRegistry {
  private readonly map = new Map<PlatformId, Channel>();

  constructor(mode: CreateRealChannelOptions['mode'] = 'stub', opts: { fetchImpl?: typeof fetch; now?: () => string } = {}) {
    if (mode === 'real' || mode === 'mixed') {
      for (const p of this.platformsForMode()) {
        const ch = createRealChannel(p, { mode: 'real', ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}), ...(opts.now ? { now: opts.now } : {}) });
        this.register(ch);
      }
    }
    if (mode === 'stub' || mode === 'mixed') {
      this.register(new XChannel());
      this.register(new XiaohongshuChannel());
      this.register(new WeiboChannel());
      this.register(new BilibiliChannel());
      this.register(new RedditChannel());
      this.register(new YoutubeChannel());
    }
  }

  private platformsForMode(): PlatformId[] {
    return ['x', 'xiaohongshu', 'weibo', 'bilibili', 'reddit', 'youtube'] as PlatformId[];
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

export function createRegistry(mode: CreateRealChannelOptions['mode'] = 'stub', opts: { fetchImpl?: typeof fetch; now?: () => string } = {}): ChannelRegistry {
  return new ChannelRegistry(mode, opts);
}

/**
 * Build a registry from the `IMA_CHANNELS_MODE` env var (or an override).
 * Resolution order per platform:
 *   1. If env var set AND mode=real/mixed → real channel takes precedence
 *   2. Otherwise → stub channel (deterministic, offline-safe)
 */
export function createRegistryFromEnv(opts: { mode?: 'stub' | 'real' | 'mixed'; fetchImpl?: typeof fetch; now?: () => string } = {}): ChannelRegistry {
  const mode = opts.mode ?? (process.env['IMA_CHANNELS_MODE'] as 'stub' | 'real' | 'mixed' | undefined) ?? 'stub';
  return new ChannelRegistry(mode, { ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}), ...(opts.now ? { now: opts.now } : {}) });
}