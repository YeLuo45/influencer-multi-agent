import { McpServer } from './server.js';
import { StubBrowserSession, type BrowserSession } from './browser.js';
import { McpHttpServer, asHttpHandler } from './http.js';
import type { HttpMcpHandler, HttpMcpResponse } from './http.js';
import { createServer as nodeCreateServer } from 'node:http';

export type { BrowserSession, StubBrowserSession };
export { McpServer, McpHttpServer, asHttpHandler };

export interface HttpServerHandle {
  port: number;
  stop(): Promise<void>;
}

export type { HttpMcpHandler, HttpMcpResponse };

export function createServer(opts?: { sessionFactory?: () => BrowserSession }): McpServer {
  return new McpServer(opts?.sessionFactory ?? (() => new StubBrowserSession()));
}

export async function startHttpServer(server: McpServer, opts: { port?: number; host?: string; path?: string } = {}): Promise<HttpServerHandle> {
  const http = new McpHttpServer(asHttpHandler(server), {
    path: opts.path ?? '/mcp',
    createServer: ((cb: (req: unknown, res: unknown) => void) => {
      const s = nodeCreateServer((req, res) => cb(req as never, res as never));
      return s as never;
    }) as never,
  });
  const port = await http.start(opts.port ?? 3000, opts.host ?? '127.0.0.1');
  return {
    port,
    async stop() {
      await http.stop();
    },
  };
}