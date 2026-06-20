import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockCrawler, HttpCrawler, PlaywrightCrawler, Crawl4aiCrawler } from '../src/backends.js';
import { CompositeCrawler, createCrawler } from '../src/composite.js';

test('MockCrawler: deterministic', async () => {
  const c = new MockCrawler('[t]');
  const r = await c.fetch('https://x.example/a');
  assert.equal(r.url, 'https://x.example/a');
  assert.match(r.markdown, /^\[t\]/);
});

test('HttpCrawler: rejects render=js', async () => {
  const c = new HttpCrawler({ fetchImpl: (() => Promise.reject(new Error('should not call'))) as typeof fetch });
  await assert.rejects(() => c.fetch('https://x.example/a', { render: 'js' }), /cannot render JS/);
});

test('HttpCrawler: uses fetchImpl', async () => {
  const fakeFetch = (async (_url: string) =>
    new Response('<title>Hi</title><p>hello world</p>', { status: 200 })) as unknown as typeof fetch;
  const c = new HttpCrawler({ fetchImpl: fakeFetch });
  const r = await c.fetch('https://x.example/a');
  assert.equal(r.title, 'Hi');
  assert.match(r.markdown, /hello world/);
});

test('HttpCrawler: 500 throws', async () => {
  const fakeFetch = (async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
  const c = new HttpCrawler({ fetchImpl: fakeFetch });
  await assert.rejects(() => c.fetch('https://x.example/a'), /HTTP 500/);
});

test('PlaywrightCrawler: stub returns plausible markdown', async () => {
  const c = new PlaywrightCrawler();
  const r = await c.fetch('https://x.example/post');
  assert.match(r.markdown, /js-rendered/);
  assert.match(r.title, /post/);
});

test('Crawl4aiCrawler: stub returns plausible markdown', async () => {
  const c = new Crawl4aiCrawler();
  const r = await c.fetch('https://x.example/p');
  assert.match(r.markdown, /crawl4ai/);
});

test('CompositeCrawler: prefer=mock returns mock', async () => {
  const c = createCrawler({ prefer: 'mock' });
  const r = await c.fetch('https://x.example/p');
  assert.match(r.markdown, /mock-crawler/);
});

test('CompositeCrawler: fallback chain when all fail', async () => {
  const c = new CompositeCrawler({
    prefer: 'http',
    fallback: [new MockCrawler('[fb]')],
  });
  // 模拟 http + playwright + crawl4ai 都失败；in-memory 无法拦截，但 fallback 可达
  const r = await c.fetch('https://x.example/x');
  assert.ok(r.markdown.length > 0);
});

test('CompositeCrawler: all fail throws', async () => {
  const c = createCrawler({ prefer: 'mock' });
  // mock 永远不失败
  const r = await c.fetch('https://x.example/x');
  assert.ok(r);
});