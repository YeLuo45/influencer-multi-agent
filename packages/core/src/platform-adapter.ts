import type { PlatformId } from './types.js';

export interface PlatformConstraints {
  maxLength: number;
  emojiEncouraged: boolean;
  hashtagStyle: 'inline' | 'newline';
  ctaSuffix: string;
  toneHint: string;
}

export const PLATFORM_CONSTRAINTS: Readonly<Record<PlatformId, PlatformConstraints>> = Object.freeze({
  x: {
    maxLength: 280,
    emojiEncouraged: false,
    hashtagStyle: 'inline',
    ctaSuffix: '',
    toneHint: 'concise, hook-first',
  },
  xiaohongshu: {
    maxLength: 1000,
    emojiEncouraged: true,
    hashtagStyle: 'newline',
    ctaSuffix: '评论区聊聊 👇',
    toneHint: 'intimate, emoji-rich, list-friendly',
  },
  weibo: {
    maxLength: 2000,
    emojiEncouraged: true,
    hashtagStyle: 'inline',
    ctaSuffix: '转发支持 🙏',
    toneHint: 'casual, leading hook in first line',
  },
  bilibili: {
    maxLength: 5000,
    emojiEncouraged: false,
    hashtagStyle: 'newline',
    ctaSuffix: '一键三连支持一下～',
    toneHint: 'community voice, three-section friendly',
  },
  reddit: {
    maxLength: 40000,
    emojiEncouraged: false,
    hashtagStyle: 'inline',
    ctaSuffix: 'What do you think?',
    toneHint: 'long-form, discussion-prompting',
  },
  youtube: {
    maxLength: 5000,
    emojiEncouraged: false,
    hashtagStyle: 'inline',
    ctaSuffix: '👍 Like & Subscribe for more',
    toneHint: 'video description; chapter markers, links, SEO keywords',
  },
});

export interface AdaptInput {
  title: string;
  body: string;
  tags: string[];
  platform: PlatformId;
}

export interface AdaptOutput {
  title: string;
  body: string;
  tags: string[];
  cta: string;
}

/** Pure-function platform adapter; deterministic; no LLM required. */
export function adaptForPlatform(input: AdaptInput): AdaptOutput {
  const c = PLATFORM_CONSTRAINTS[input.platform];
  switch (input.platform) {
    case 'x':
      return adaptX(input, c);
    case 'xiaohongshu':
      return adaptXiaohongshu(input, c);
    case 'weibo':
      return adaptWeibo(input, c);
    case 'bilibili':
      return adaptBilibili(input, c);
    case 'reddit':
      return adaptReddit(input, c);
    case 'youtube':
      return adaptYoutube(input, c);
  }
}

function truncate(s: string, max: number, suffix = ''): string {
  if (s.length <= max) return s;
  return s.slice(0, max - suffix.length) + suffix;
}

function adaptX(input: AdaptInput, c: PlatformConstraints): AdaptOutput {
  const title = truncate(input.title, 100);
  const body = truncate(`${input.body}\n\n${input.tags.join(' ')}`, c.maxLength, '...');
  return {
    title,
    body,
    tags: input.tags.slice(0, 3),
    cta: c.ctaSuffix,
  };
}

function adaptXiaohongshu(input: AdaptInput, c: PlatformConstraints): AdaptOutput {
  const emojiPrefix = '姐妹们！';
  const bodyWithEmoji = `${emojiPrefix}${input.body}\n\n🌟 重点来了\n\n${truncate(input.body, 400)}`;
  const tagsBlock = c.hashtagStyle === 'newline' ? input.tags.map((t) => `#${t}`).join(' ') : input.tags.map((t) => `#${t}`).join('');
  const body = truncate(`${bodyWithEmoji}\n\n${tagsBlock}\n\n❤️`, c.maxLength);
  return {
    title: truncate(input.title, 60),
    body,
    tags: input.tags.slice(0, 5),
    cta: c.ctaSuffix,
  };
}

function adaptWeibo(input: AdaptInput, c: PlatformConstraints): AdaptOutput {
  const lead = `${input.title}\n\n`;
  const body = truncate(`${lead}${input.body}\n\n${input.tags.map((t) => `#${t}`).join(' ')}`, c.maxLength, '...');
  return {
    title: truncate(input.title, 80),
    body: truncate(body, c.maxLength, '...'),
    tags: input.tags.slice(0, 5),
    cta: c.ctaSuffix,
  };
}

function adaptBilibili(input: AdaptInput, c: PlatformConstraints): AdaptOutput {
  const sections = [
    `【${input.title}】`,
    '',
    '▎核心观点',
    input.body,
    '',
    '▎互动',
    c.ctaSuffix,
  ];
  return {
    title: truncate(input.title, 80),
    body: truncate(sections.join('\n'), c.maxLength),
    tags: input.tags.slice(0, 5),
    cta: c.ctaSuffix,
  };
}

function adaptReddit(input: AdaptInput, c: PlatformConstraints): AdaptOutput {
  return {
    title: truncate(input.title, 300),
    body: truncate(input.body, c.maxLength, '...'),
    tags: input.tags,
    cta: 'What do you think?',
  };
}

function adaptYoutube(input: AdaptInput, c: PlatformConstraints): AdaptOutput {
  // YouTube description is a separate field from the title. We keep the
  // platform-adapted body for the description and put a "shorts-friendly"
  // lead in the title.
  const title = truncate(input.title, 100);
  const body = truncate(`${input.body}\n\n${c.ctaSuffix}`, c.maxLength);
  return { title, body, tags: input.tags, cta: c.ctaSuffix };
}

export interface AdaptAllInput {
  title: string;
  body: string;
  tags: string[];
  platforms: PlatformId[];
}

export function adaptForAllPlatforms(input: AdaptAllInput): Record<PlatformId, AdaptOutput> {
  const out = {} as Record<PlatformId, AdaptOutput>;
  for (const p of input.platforms) {
    out[p] = adaptForPlatform({ ...input, platform: p });
  }
  return out;
}