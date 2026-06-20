// 浏览器自动化抽象层 - 真实实现接 Playwright；stub 实现返回 deterministic 结果

export interface BrowserSession {
  navigate(url: string): Promise<void>;
  snapshot(): Promise<{ url: string; title: string; text: string }>;
  extractText(selector: string): Promise<string>;
  click(ref: string): Promise<void>;
  waitFor(condition: { selector?: string; text?: string; timeoutMs?: number }): Promise<void>;
  close(): Promise<void>;
}

export class StubBrowserSession implements BrowserSession {
  private currentUrl = '';
  private title = '';
  private text = '';

  async navigate(url: string): Promise<void> {
    this.currentUrl = url;
    this.title = extractTitle(url);
    this.text = `[browser-stub] navigated to ${url}`;
  }

  async snapshot(): Promise<{ url: string; title: string; text: string }> {
    return { url: this.currentUrl, title: this.title, text: this.text };
  }

  async extractText(selector: string): Promise<string> {
    return `[browser-stub] text under "${selector}" on ${this.currentUrl}`;
  }

  async click(_ref: string): Promise<void> {
    // no-op stub
  }

  async waitFor(_condition: { selector?: string; text?: string; timeoutMs?: number }): Promise<void> {
    // no-op stub
  }

  async close(): Promise<void> {
    this.currentUrl = '';
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