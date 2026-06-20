export type FetchResult = {
  url: string;
  title: string;
  markdown: string;
};

export class HttpCrawler {
  constructor(private readonly opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}) {}

  async fetch(url: string, opts?: { render?: 'static' | 'js' }): Promise<FetchResult> {
    if (opts?.render === 'js') throw new Error('HttpCrawler cannot render JS');
    const f = this.opts.fetchImpl ?? fetch;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? 5000);
    try {
      const resp = await f(url, { signal: ctrl.signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const html = await resp.text();
      return htmlToMarkdown(url, html);
    } finally {
      clearTimeout(timer);
    }
  }
}

export class PlaywrightCrawler {
  async fetch(url: string, _opts?: { render?: 'static' | 'js' }): Promise<FetchResult> {
    return {
      url,
      title: extractTitle(url),
      markdown: `[js-rendered] ${url}\n\nContent extracted by headless browser (stub).`,
    };
  }
}

export class Crawl4aiCrawler {
  async fetch(url: string, _opts?: { render?: 'static' | 'js' }): Promise<FetchResult> {
    return {
      url,
      title: extractTitle(url),
      markdown: `[crawl4ai] ${url}\n\nLLM-friendly markdown extracted via Python bridge (stub).`,
    };
  }
}

export class MockCrawler {
  constructor(private readonly prefix = '[mock-crawler]') {}
  async fetch(url: string, _opts?: { render?: 'static' | 'js' }): Promise<FetchResult> {
    return {
      url,
      title: extractTitle(url),
      markdown: `${this.prefix} ${url}\n\nThis is a deterministic stub response for offline testing.`,
    };
  }
}

function extractTitle(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.split('/').filter(Boolean).pop() ?? u.hostname;
  } catch {
    return url;
  }
}

function htmlToMarkdown(url: string, html: string): FetchResult {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : extractTitle(url);
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  return { url, title, markdown: text.slice(0, 4096) };
}