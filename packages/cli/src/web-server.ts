/**
 * Tiny embedded HTTP server for the IMA web console.
 *
 * Routes:
 *   GET  /                  → apps/web/index.html
 *   GET  /style.css          → apps/web/style.css
 *   GET  /app.js             → apps/web/app.js
 *   GET  /api/contents       → JSON array of content summaries
 *   GET  /api/queue          → { summary, items } for .ima/queue
 *   GET  /api/feedback       → window-filtered feedback summary
 *   GET  /api/ab?id=...      → AbReport for a content id
 *
 * Pure stdlib — no Express / no Vite / no build step. The web package is
 * plain HTML + vanilla JS that fetches these JSON endpoints.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { JsonStore, buildAbReport } from '@ima/core';

// Resolve apps/web/ relative to this file. web-server.ts lives at
// packages/cli/src/web-server.ts → up two levels to packages/cli/, then up
// one level to the monorepo root, then into apps/web.
const WEB_DIR = resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..', 'apps', 'web');

export interface WebServerOptions {
  host?: string;
  port?: number;
  store: JsonStore;
  now?: () => string;
}

export interface WebServerHandle {
  url: string;
  close(): Promise<void>;
}

export async function startWebServer(opts: WebServerOptions): Promise<WebServerHandle> {
  const host = opts.host ?? '127.0.0.1';
  const requestedPort = opts.port ?? 5173;
  const now = opts.now ?? (() => new Date().toISOString());

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      await handle(req, res, { store: opts.store, now });
    } catch (e: unknown) {
      send(res, 500, 'application/json', JSON.stringify({ error: (e as Error).message }));
    }
  });

  const actualPort = await new Promise<number>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(requestedPort, host, () => {
      // resolve with the actual chosen port (0 lets the OS pick)
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : requestedPort;
      resolveListen(port);
    });
  });

  return {
    url: `http://${host}:${actualPort}`,
    close: () => new Promise<void>((res, rej) => server.close((e) => (e ? rej(e) : res()))),
  };
}

interface HandleCtx {
  store: JsonStore;
  now: () => string;
}

async function handle(req: IncomingMessage, res: ServerResponse, ctx: HandleCtx): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;

  if (path === '/api/contents') return await apiContents(res, ctx);
  if (path === '/api/queue') return await apiQueue(res, ctx);
  if (path === '/api/feedback') return await apiFeedback(res, ctx);
  if (path === '/api/ab') return await apiAb(res, url, ctx);
  return await serveStatic(path, res);
}

async function apiContents(res: ServerResponse, ctx: HandleCtx): Promise<void> {
  const files = await ctx.store.list('content');
  const ids = files.filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
  const out: Array<{ id: string; topic: string; stage: string; persona: string; posts: number; engagement: number }> = [];
  for (const id of ids) {
    const c = await ctx.store.read<{ id: string; topic: string; stage: string; persona: string; posts: unknown[]; engagement: unknown[] }>(`content/${id}.json`);
    if (!c) continue;
    out.push({
      id: c.id,
      topic: c.topic,
      stage: c.stage,
      persona: c.persona,
      posts: c.posts?.length ?? 0,
      engagement: c.engagement?.length ?? 0,
    });
  }
  sendJson(res, out);
}

async function apiQueue(res: ServerResponse, ctx: HandleCtx): Promise<void> {
  const dir = ctx.store.path('queue');
  const items: Array<Record<string, unknown>> = [];
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      const raw = readFileSync(join(dir, f), 'utf-8');
      if (raw.trim()) items.push(JSON.parse(raw));
    }
  }
  const byStatus: Record<string, number> = { pending: 0, posting: 0, posted: 0, failed_retry: 0, failed_dead: 0 };
  for (const it of items) byStatus[it['status'] as string] = (byStatus[it['status'] as string] ?? 0) + 1;
  sendJson(res, { summary: { total: items.length, byStatus }, items });
}

async function apiFeedback(res: ServerResponse, ctx: HandleCtx): Promise<void> {
  // window-filtered summary; import here to avoid circulars
  const { emptyFeedback, filterByWindow, appendFeedback } = await import('@ima/core');
  const stateRaw = await ctx.store.read<{ records: never; windowDays: number; lastUpdated: string; totalRecords: number }>('feedback.json');
  const state = stateRaw ?? emptyFeedback(ctx.now());
  const recent = filterByWindow((state.records as never) ?? [], state.windowDays ?? 7, ctx.now());
  const next = appendFeedback(state as never, [], ctx.now());
  void next;
  sendJson(res, {
    windowDays: state.windowDays ?? 7,
    totalRecords: state.totalRecords ?? 0,
    lastUpdated: state.lastUpdated ?? null,
    recentCount: recent.length,
  });
}

async function apiAb(res: ServerResponse, url: URL, ctx: HandleCtx): Promise<void> {
  const id = url.searchParams.get('id');
  if (!id) return sendJsonError(res, 400, 'id required');
  const c = await ctx.store.read<{ id: string; posts: never; engagement: never }>(`content/${id}.json`);
  if (!c) return sendJsonError(res, 404, `not found: ${id}`);
  const report = buildAbReport(id, (c.posts as never) ?? [], (c.engagement as never) ?? [], { minSampleSize: 1, now: ctx.now() });
  sendJson(res, report);
}

async function serveStatic(path: string, res: ServerResponse): Promise<void> {
  const safe = path.replace(/\.\.+/g, '');
  const file = join(WEB_DIR, safe === '/' ? 'index.html' : safe);
  if (!existsSync(file)) return send(res, 404, 'text/plain', `not found: ${file} (WEB_DIR=${WEB_DIR})`);
  const data = readFileSync(file);
  const ct = file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'application/javascript' : 'application/octet-stream';
  send(res, 200, ct, data);
}

function sendJson(res: ServerResponse, body: unknown): void {
  send(res, 200, 'application/json', JSON.stringify(body));
}
function sendJsonError(res: ServerResponse, status: number, msg: string): void {
  send(res, status, 'application/json', JSON.stringify({ error: msg }));
}
function send(res: ServerResponse, status: number, contentType: string, body: string | Uint8Array): void {
  res.writeHead(status, { 'content-type': contentType, 'cache-control': 'no-store' });
  res.end(body);
}
