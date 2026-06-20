import { McpServer } from './server.js';
import { StubBrowserSession, type BrowserSession } from './browser.js';

export type { BrowserSession, StubBrowserSession };
export { McpServer };

export function createServer(opts?: { sessionFactory?: () => BrowserSession }): McpServer {
  return new McpServer(opts?.sessionFactory ?? (() => new StubBrowserSession()));
}