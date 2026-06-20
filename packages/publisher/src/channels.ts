import type { PlatformId, PostRecord } from '@ima/core/types';

export interface PostInput {
  title: string;
  body: string;
  tags: string[];
}

export interface Channel {
  readonly id: PlatformId;
  post(input: PostInput, opts?: { now?: string }): Promise<PostRecord>;
  healthCheck(): Promise<{ ok: boolean; detail: string }>;
}

export class StubChannelBase implements Channel {
  readonly id: PlatformId;

  constructor(id: PlatformId) {
    this.id = id;
  }

  async post(input: PostInput, opts?: { now?: string }): Promise<PostRecord> {
    const postId = `${this.id}-${hash(input.title)}`;
    return {
      platform: this.id,
      postId,
      status: 'posted',
      url: `https://${this.id}.example.com/p/${postId}`,
      postedAt: opts?.now ?? new Date().toISOString(),
    };
  }

  async healthCheck(): Promise<{ ok: boolean; detail: string }> {
    return { ok: true, detail: `${this.id} stub healthy` };
  }
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36).slice(0, 8);
}

export class XChannel extends StubChannelBase {
  constructor() {
    super('x');
  }
}

export class XiaohongshuChannel extends StubChannelBase {
  constructor() {
    super('xiaohongshu');
  }
}

export class WeiboChannel extends StubChannelBase {
  constructor() {
    super('weibo');
  }
}

export class BilibiliChannel extends StubChannelBase {
  constructor() {
    super('bilibili');
  }
}

export class RedditChannel extends StubChannelBase {
  constructor() {
    super('reddit');
  }
}

export class AlwaysFailChannel implements Channel {
  readonly id: PlatformId;
  constructor(id: PlatformId) {
    this.id = id;
  }
  async post(_input: PostInput): Promise<PostRecord> {
    return { platform: this.id, postId: null, status: 'failed', error: 'always fail' };
  }
  async healthCheck() {
    return { ok: false, detail: 'always fail' };
  }
}