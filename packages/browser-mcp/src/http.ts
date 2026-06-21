// Streamable HTTP transport for MCP — implements JSON-RPC over HTTP POST + SSE.
// Spec reference: https://modelcontextprotocol.io/specification/2025-06-18/transport
// Compatible with chrome-devtools-mcp / useMcp.js style clients.

export interface HttpMcpRequest {
  jsonrpc: '2.0';
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface HttpMcpResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface HttpMcpHandler {
  handle(req: HttpMcpRequest): Promise<HttpMcpResponse>;
}

export interface HttpServerOptions {
  port?: number;
  host?: string;
  path?: string;
  log?: boolean;
  heartbeatMs?: number;
  sessionMaxAgeMs?: number;
}

type AnyServer = {
  listen: (port: number, host: string, cb?: () => void) => AnyServer;
  close: (cb?: (err?: Error) => void) => AnyServer;
  address: () => { port: number } | null;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  once: (event: string, cb: (...args: unknown[]) => void) => void;
  off: (event: string, cb: (...args: unknown[]) => void) => void;
};
type AnyReq = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
};
type AnyRes = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  flushHeaders?: () => void;
  write: (chunk: string) => void;
  end: (chunk?: string) => void;
};

type SseSession = {
  id: string;
  res: AnyRes;
  cleanup: () => void;
};

export class McpHttpServer {
  private readonly server: AnyServer;
  private readonly path: string;
  private readonly log: boolean;
  private readonly heartbeatMs: number;
  private readonly sessionMaxAgeMs: number;
  private readonly sessions = new Map<string, SseSession>();
  private actualPort: number = 0;
  private listening = false;

  constructor(
    private readonly handler: HttpMcpHandler,
    opts: HttpServerOptions & { createServer?: (cb: (req: AnyReq, res: AnyRes) => void) => AnyServer } = {},
  ) {
    this.path = opts.path ?? '/mcp';
    this.log = opts.log ?? false;
    this.heartbeatMs = opts.heartbeatMs ?? 15000;
    this.sessionMaxAgeMs = opts.sessionMaxAgeMs ?? 5 * 60 * 1000;
    const createServerImpl = opts.createServer ?? (globalThis as { [k: string]: unknown })['___createServer___'];
    if (typeof createServerImpl !== 'function') {
      throw new Error('McpHttpServer requires node:http; pass opts.createServer or call __bindHttpServer first');
    }
    this.server = (createServerImpl as (cb: (req: AnyReq, res: AnyRes) => void) => AnyServer)((req, res) => {
      void this.onRequest(req, res);
    });
  }

  async start(port = 3000, host = '127.0.0.1'): Promise<number> {
    if (this.listening) return this.actualPort;
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, host, () => {
        this.server.off('error', reject);
        resolve();
      });
    });
    const addr = this.server.address();
    this.actualPort = addr?.port ?? port;
    this.listening = true;
    if (this.log) console.log(`[mcp-http] listening on http://${host}:${this.actualPort}${this.path}`);
    return this.actualPort;
  }

  async stop(): Promise<void> {
    if (!this.listening) return;
    await new Promise<void>((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
    this.listening = false;
  }

  port(): number {
    return this.actualPort;
  }

  isListening(): boolean {
    return this.listening;
  }

  sessionCount(): number {
    return this.sessions.size;
  }

  sessionIds(): string[] {
    return Array.from(this.sessions.keys()).sort();
  }

  /** Test helper: return live session descriptors in insertion order. */
  getSessions(): Array<{ id: string; res: AnyRes; cleanup: () => void }> {
    return Array.from(this.sessions.values()).map((s) => ({ id: s.id, res: s.res, cleanup: s.cleanup }));
  }

  private async onRequest(req: AnyReq, res: AnyRes): Promise<void> {
    const url = req.url ?? '/';
    if (url === '/health' || url === `${this.path}/health`) {
      this.sendJson(res, 200, { ok: true, server: 'ima-browser-mcp', listening: this.listening });
      return;
    }
    if (url !== this.path) {
      this.sendJson(res, 404, { error: 'not found' });
      return;
    }
    if (req.method === 'GET') {
      this.startSseSession(req, res);
      return;
    }
    if (req.method === 'POST') {
      await this.handlePost(req, res);
      return;
    }
    if (req.method === 'DELETE') {
      const sessionId = headerValue(req.headers['mcp-session-id']);
      if (sessionId) this.sessions.get(sessionId)?.cleanup();
      res.statusCode = 204;
      res.end();
      return;
    }
    this.sendJson(res, 405, { error: `method not allowed: ${req.method}` });
  }

  private async handlePost(req: AnyReq, res: AnyRes): Promise<void> {
    const chunks: string[] = [];
    await new Promise<void>((resolve) => {
      req.on('data', (chunk: unknown) => {
        if (typeof chunk === 'string') chunks.push(chunk);
        else if (Buffer.isBuffer(chunk)) chunks.push(chunk.toString('utf-8'));
      });
      req.on('end', () => resolve());
    });
    const body = chunks.join('');
    if (!body) {
      this.sendJson(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'empty body' } });
      return;
    }
    let parsed: HttpMcpRequest;
    try {
      parsed = JSON.parse(body);
    } catch (e) {
      this.sendJson(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: `parse: ${(e as Error).message}` } });
      return;
    }
    const accept = String(req.headers['accept'] ?? '');
    const wantsSse = accept.includes('text/event-stream');
    try {
      const resp = await this.handler.handle(parsed);
      if (wantsSse) {
        this.startSseSession(req, res, [resp]);
      } else {
        this.sendJson(res, 200, resp);
      }
    } catch (e) {
      const errResp: HttpMcpResponse = {
        jsonrpc: '2.0',
        id: parsed.id ?? null,
        error: { code: -32603, message: (e as Error).message },
      };
      if (wantsSse) {
        this.startSseSession(req, res, [errResp]);
      } else {
        this.sendJson(res, 500, errResp);
      }
    }
  }

  private startSseSession(req: AnyReq, res: AnyRes, initial?: HttpMcpResponse[]): void {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    const sessionId = `s-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`;
    res.write(`event: open\ndata: {"sessionId":"${sessionId}"}\n\n`);
    if (initial) {
      for (const r of initial) {
        res.write(`event: message\ndata: ${JSON.stringify(r)}\n\n`);
      }
    }
    const heartbeat = setInterval(() => {
      res.write(`event: ping\ndata: {}\n\n`);
    }, this.heartbeatMs);
    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      this.sessions.delete(sessionId);
      res.end();
    };
    this.sessions.set(sessionId, { id: sessionId, res, cleanup });
    req.on('close', cleanup);
    req.on('error', cleanup);
    setTimeout(cleanup, this.sessionMaxAgeMs);
  }

  private sendJson(res: AnyRes, status: number, body: unknown): void {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  }
}

export function asHttpHandler(server: { handle(req: { jsonrpc: '2.0'; id: number; method: string; params?: Record<string, unknown> }): Promise<unknown> }): HttpMcpHandler {
  return {
    async handle(req): Promise<HttpMcpResponse> {
      try {
        const id = typeof req.id === 'string' ? Number(req.id) || 0 : (req.id ?? 0);
        const result = await server.handle({ ...req, jsonrpc: '2.0', id });
        return result as HttpMcpResponse;
      } catch (e) {
        return { jsonrpc: '2.0', id: req.id ?? null, error: { code: -32603, message: (e as Error).message } };
      }
    },
  };
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Internal helper to bridge node:http through a runtime indirection. */
export function __bindHttpServer(createServerFn: (cb: (req: AnyReq, res: AnyRes) => void) => AnyServer): void {
  (globalThis as { [k: string]: unknown })['___createServer___'] = createServerFn;
}