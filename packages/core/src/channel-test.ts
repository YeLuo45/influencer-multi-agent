// Channel connectivity smoke check. Pings a single platform's
// authenticated endpoint (e.g. X GET /2/users/me) and reports a normalized
// result. Does NOT post content. The CLI `ima channel-test <platform>`
// command surfaces the same data the web console needs to render
// "last verified" badges.

export interface ChannelHealth {
  platform: string;
  ok: boolean;
  detail: string;
  latencyMs: number;
  status?: number;
  retryable?: boolean;
  skippedReason?: 'auth' | 'network' | 'unknown';
}

export interface ChannelHealthCheckOptions {
  credential?: string;
  envKey: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

interface PlatformProbe {
  buildUrl: () => string;
  parseUser: (body: string) => string;
}

const PROBES: Record<string, PlatformProbe> = {
  x: {
    buildUrl: () => 'https://api.twitter.com/2/users/me',
    parseUser: (body) => {
      try {
        const j = JSON.parse(body) as { data?: { id?: string; username?: string } };
        return j.data?.username ?? j.data?.id ?? 'ok';
      } catch { return 'ok'; }
    },
  },
  reddit: {
    buildUrl: () => 'https://oauth.reddit.com/api/v1/me',
    parseUser: (body) => {
      try { return (JSON.parse(body) as { name?: string }).name ?? 'ok'; } catch { return 'ok'; }
    },
  },
  bilibili: {
    buildUrl: () => 'https://api.bilibili.com/x/web-interface/nav',
    parseUser: (body) => {
      try { return (JSON.parse(body) as { data?: { uname?: string } }).data?.uname ?? 'ok'; } catch { return 'ok'; }
    },
  },
  weibo: {
    buildUrl: () => 'https://api.weibo.com/2/account/get_uid.json',
    parseUser: (body) => {
      try { return (JSON.parse(body) as { uid?: number }).uid !== undefined ? 'ok' : 'unparsed'; } catch { return 'ok'; }
    },
  },
  xiaohongshu: {
    buildUrl: () => 'https://edith.xiaohongshu.com/api/sns/web/v2/user/me',
    parseUser: () => 'ok',
  },
  youtube: {
    buildUrl: () => 'https://www.googleapis.com/youtube/v3/channels?part=id&mine=true',
    parseUser: (body) => {
      try { return (JSON.parse(body) as { items?: unknown[] }).items?.[0] ? 'ok' : 'empty'; } catch { return 'ok'; }
    },
  },
};

export async function channelHealthCheck(platform: string, opts: ChannelHealthCheckOptions): Promise<ChannelHealth> {
  const start = (opts.now ?? Date.now)();
  if (!opts.credential || opts.credential.trim().length === 0) {
    return {
      platform,
      ok: false,
      detail: `missing credential: set ${opts.envKey}`,
      latencyMs: 0,
      skippedReason: 'auth',
    };
  }
  const probe = PROBES[platform];
  if (!probe) {
    return {
      platform,
      ok: false,
      detail: `unknown platform: ${platform}`,
      latencyMs: 0,
      skippedReason: 'unknown',
    };
  }
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = probe.buildUrl();
  const cred = opts.credential.trim();
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cred}`,
        'X-Client-Secret': cred,
        Accept: 'application/json',
      },
    });
    const body = await res.text();
    const detail = `${platform} ${res.status} ${probe.parseUser(body)}`;
    const ok = res.status >= 200 && res.status < 300;
    const retryable = res.status === 429 || res.status >= 500;
    return {
      platform,
      ok,
      detail,
      latencyMs: ((opts.now ?? Date.now)()) - start,
      status: res.status,
      ...(retryable ? { retryable: true } : {}),
    };
  } catch (e) {
    return {
      platform,
      ok: false,
      detail: `network: ${(e as Error).message}`,
      latencyMs: ((opts.now ?? Date.now)()) - start,
      skippedReason: 'network',
    };
  }
}

export interface ChannelHealthSummary {
  total: number;
  okCount: number;
  failCount: number;
  retryableCount: number;
  byPlatform: Record<string, ChannelHealth>;
}

export function summarizeChannelHealth(rows: ChannelHealth[]): ChannelHealthSummary {
  const byPlatform: Record<string, ChannelHealth> = {};
  let okCount = 0, failCount = 0, retryableCount = 0;
  for (const r of rows) {
    byPlatform[r.platform] = r;
    if (r.ok) okCount++; else failCount++;
    if (r.retryable) retryableCount++;
  }
  return { total: rows.length, okCount, failCount, retryableCount, byPlatform };
}
