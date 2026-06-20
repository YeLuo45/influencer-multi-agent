import { HttpCrawler, PlaywrightCrawler, Crawl4aiCrawler, MockCrawler } from './backends.js';
import type { FetchResult } from './backends.js';

type Backend = HttpCrawler | PlaywrightCrawler | Crawl4aiCrawler | MockCrawler;

export interface CompositeOptions {
  primary?: Backend;
  fallback?: Backend[];
  prefer?: 'http' | 'playwright' | 'crawl4ai' | 'mock';
}

export class CompositeCrawler {
  private readonly chain: Backend[];

  constructor(opts: CompositeOptions = {}) {
    const prefer = opts.prefer ?? 'http';
    let chain: Backend[];
    if (prefer === 'http') {
      chain = [opts.primary ?? new HttpCrawler(), new PlaywrightCrawler(), new Crawl4aiCrawler()];
    } else if (prefer === 'playwright') {
      chain = [new PlaywrightCrawler(), new HttpCrawler(), new Crawl4aiCrawler()];
    } else if (prefer === 'crawl4ai') {
      chain = [new Crawl4aiCrawler(), new PlaywrightCrawler(), new HttpCrawler()];
    } else {
      chain = [new MockCrawler()];
    }
    if (opts.fallback) chain.push(...opts.fallback);
    this.chain = chain;
  }

  async fetch(url: string, opts?: { render?: 'static' | 'js' }): Promise<FetchResult> {
    const errors: string[] = [];
    for (const c of this.chain) {
      try {
        return await c.fetch(url, opts);
      } catch (e) {
        errors.push(`${c.constructor.name}: ${(e as Error).message}`);
      }
    }
    throw new Error(`all crawlers failed: ${errors.join(' | ')}`);
  }
}

export function createCrawler(opts?: CompositeOptions): CompositeCrawler {
  return new CompositeCrawler(opts);
}