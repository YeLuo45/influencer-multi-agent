import { test } from 'node:test';
import assert from 'node:assert/strict';
import { McpServer } from '../src/server.js';
import { McpHttpServer, asHttpHandler, __bindHttpServer } from '../src/http.js';
import type { HttpMcpHandler, HttpMcpResponse } from '../src/http.js';

type ReqHandler = (req: StubReq, res: StubRes) => void;

class StubReq {
  method: string = 'POST';
  url: string = '/mcp';
  headers: Record<string, string> = {};
  private dataHandlers: Array<(c: unknown) => void> = [];
  private endHandlers: Array<() => void> = [];
  on(e: string, l: (...args: unknown[]) => void): this {
    if (e === 'data') this.dataHandlers.push(l as (c: unknown) => void);
    if (e === 'end') this.endHandlers.push(l as () => void);
    return this;
  }
  emit(chunk: string): void { for (const h of this.dataHandlers) h(chunk); }
  finish(): void { for (const h of this.endHandlers) h(); }
}

class StubRes {
  statusCode = 200;
  headers: Record<string, string> = {};
  body = '';
  chunks: string[] = [];
  ended = false;
  setHeader(n: string, v: string): void { this.headers[n] = v; }
  flushHeaders(): void { /* noop */ }
  write(chunk: string): boolean { this.chunks.push(chunk); return true; }
  end(chunk?: string): void { this.ended = true; if (chunk) this.chunks.push(chunk); this.body = this.chunks.join(''); }
}

class StubServer {
  port = 0;
  host = '';
  listening = false;
  handler: ReqHandler | null = null;
  listen(p: number, h: string, cb?: () => void): this {
    this.port = p; this.host = h; this.listening = true;
    setImmediate(() => { cb?.(); });
    return this;
  }
  close(cb?: (err?: Error) => void): this {
    this.listening = false;
    setImmediate(() => { cb?.(); });
    return this;
  }
  address(): { port: number } { return { port: this.port || 9999 }; }
  on(): this { return this; }
  once(): this { return this; }
  off(): this { return this; }
}

interface HttpInternals {
  server: { handler: ReqHandler | null };
}

function bindStub(): void {
  __bindHttpServer((handler: ReqHandler) => {
    const s = new StubServer();
    s.handler = handler;
    return s as unknown as never;
  });
}

function getServer(http: McpHttpServer): StubServer {
  return (http as unknown as HttpInternals).server as unknown as StubServer;
}

function fire(http: McpHttpServer, req: StubReq, res: StubRes): void {
  const s = getServer(http);
  if (s.handler) s.handler(req, res);
}

test('setup: bind stub http server', () => {
  bindStub();
});

test('McpHttpServer: handles initialize POST → 200 JSON', async () => {
  bindStub();
  const handler: HttpMcpHandler = {
    async handle(req): Promise<HttpMcpResponse> {
      return { jsonrpc: '2.0', id: req.id ?? null, result: { ok: true, echo: req.method } };
    },
  };
  const http = new McpHttpServer(handler);
  await http.start(0);
  const req = new StubReq();
  req.method = 'POST';
  req.headers['accept'] = 'application/json';
  const res = new StubRes();
  fire(http, req, res);
  req.emit('{"jsonrpc":"2.0","id":1,"method":"initialize"}');
  req.finish();
  await new Promise((r) => setImmediate(r));
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /"echo":"initialize"/);
  await http.stop();
});

test('McpHttpServer: GET /health → 200 with ok', async () => {
  bindStub();
  const http = new McpHttpServer({ async handle() { return { jsonrpc: '2.0', id: null }; } });
  await http.start(0);
  const req = new StubReq();
  req.method = 'GET';
  req.url = '/health';
  const res = new StubRes();
  fire(http, req, res);
  await new Promise((r) => setImmediate(r));
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /"ok":true/);
  await http.stop();
});

test('McpHttpServer: unknown path → 404', async () => {
  bindStub();
  const http = new McpHttpServer({ async handle() { return { jsonrpc: '2.0', id: null }; } });
  await http.start(0);
  const req = new StubReq();
  req.method = 'GET';
  req.url = '/nope';
  const res = new StubRes();
  fire(http, req, res);
  await new Promise((r) => setImmediate(r));
  assert.equal(res.statusCode, 404);
  await http.stop();
});

test('McpHttpServer: POST empty body → 400', async () => {
  bindStub();
  const http = new McpHttpServer({ async handle() { return { jsonrpc: '2.0', id: null }; } });
  await http.start(0);
  const req = new StubReq();
  req.method = 'POST';
  const res = new StubRes();
  fire(http, req, res);
  req.finish();
  await new Promise((r) => setImmediate(r));
  assert.equal(res.statusCode, 400);
  await http.stop();
});

test('McpHttpServer: POST bad JSON → 400 parse error', async () => {
  bindStub();
  const http = new McpHttpServer({ async handle() { return { jsonrpc: '2.0', id: null }; } });
  await http.start(0);
  const req = new StubReq();
  req.method = 'POST';
  const res = new StubRes();
  fire(http, req, res);
  req.emit('not-json');
  req.finish();
  await new Promise((r) => setImmediate(r));
  assert.equal(res.statusCode, 400);
  assert.match(res.body, /parse/);
  await http.stop();
});

test('McpHttpServer: POST with text/event-stream accept → SSE', async () => {
  bindStub();
  const handler: HttpMcpHandler = {
    async handle(req): Promise<HttpMcpResponse> {
      return { jsonrpc: '2.0', id: req.id ?? null, result: { ok: true, method: req.method } };
    },
  };
  const http = new McpHttpServer(handler, { heartbeatMs: 50, sessionMaxAgeMs: 100 });
  await http.start(0);
  const req = new StubReq();
  req.method = 'POST';
  req.headers['accept'] = 'text/event-stream';
  const res = new StubRes();
  fire(http, req, res);
  req.emit('{"jsonrpc":"2.0","id":7,"method":"initialize"}');
  req.finish();
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(res.headers['Content-Type'], 'text/event-stream');
  assert.match(res.body, /event: message/);
  await http.stop();
});

test('McpHttpServer: tracks concurrent SSE sessions and DELETE closes them', async () => {
  bindStub();
  const http = new McpHttpServer({ async handle() { return { jsonrpc: '2.0', id: null }; } }, { heartbeatMs: 1000, sessionMaxAgeMs: 10000 });
  await http.start(0);

  const req1 = new StubReq();
  req1.method = 'GET';
  const res1 = new StubRes();
  fire(http, req1, res1);
  const req2 = new StubReq();
  req2.method = 'GET';
  const res2 = new StubRes();
  fire(http, req2, res2);
  await new Promise((r) => setImmediate(r));

  assert.equal(http.sessionCount(), 2);
  const sessions = http.getSessions();
  assert.equal(sessions.length, 2);
  assert.notEqual(sessions[0]!.id, sessions[1]!.id);

  const del = new StubReq();
  del.method = 'DELETE';
  del.headers['mcp-session-id'] = sessions[0]!.id;
  const delRes = new StubRes();
  fire(http, del, delRes);
  await new Promise((r) => setImmediate(r));

  assert.equal(delRes.statusCode, 204);
  assert.equal(http.sessionCount(), 1);
  assert.equal(sessions[0]!.res.ended, true);
  assert.equal(sessions[1]!.res.ended, false);
  await http.stop();
});

test('McpHttpServer: handler throws → 500 error envelope', async () => {
  bindStub();
  const handler: HttpMcpHandler = {
    async handle(): Promise<HttpMcpResponse> {
      throw new Error('boom');
    },
  };
  const http = new McpHttpServer(handler);
  await http.start(0);
  const req = new StubReq();
  req.method = 'POST';
  const res = new StubRes();
  fire(http, req, res);
  req.emit('{"jsonrpc":"2.0","id":1,"method":"x"}');
  req.finish();
  await new Promise((r) => setImmediate(r));
  assert.equal(res.statusCode, 500);
  assert.match(res.body, /boom/);
  await http.stop();
});

test('McpHttpServer: DELETE method → 204', async () => {
  bindStub();
  const http = new McpHttpServer({ async handle() { return { jsonrpc: '2.0', id: null }; } });
  await http.start(0);
  const req = new StubReq();
  req.method = 'DELETE';
  const res = new StubRes();
  fire(http, req, res);
  await new Promise((r) => setImmediate(r));
  assert.equal(res.statusCode, 204);
  await http.stop();
});

test('asHttpHandler: bridges McpServer.handle', async () => {
  const mcp = new McpServer();
  const h = asHttpHandler(mcp);
  const r = await h.handle({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  assert.ok(r.result);
});

test('asHttpHandler: converts string id to number safely', async () => {
  const mcp = new McpServer();
  const h = asHttpHandler(mcp);
  const r = await h.handle({ jsonrpc: '2.0', id: '5', method: 'tools/list' });
  assert.ok(r.result);
});

test('McpHttpServer: port() returns actual port', async () => {
  bindStub();
  const http = new McpHttpServer({ async handle() { return { jsonrpc: '2.0', id: null }; } });
  const p = await http.start(0);
  assert.equal(http.port(), p);
  await http.stop();
});

test('McpHttpServer: isListening toggles', async () => {
  bindStub();
  const http = new McpHttpServer({ async handle() { return { jsonrpc: '2.0', id: null }; } });
  assert.equal(http.isListening(), false);
  await http.start(0);
  assert.equal(http.isListening(), true);
  await http.stop();
  assert.equal(http.isListening(), false);
});