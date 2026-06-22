import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectLlm, type LlmSelection } from '../src/llm.js';

void test('selectLlm: defaults to MockLlm when env is empty', () => {
  const env: Record<string, string | undefined> = {};
  const r = selectLlm(env);
  assert.equal(r.source, 'mock');
  assert.equal(r.llm.provider, 'mock');
});

void test('selectLlm: picks OpenAICompatibleLlm when IMA_LLM_* env is fully set', () => {
  const env: Record<string, string | undefined> = {
    IMA_LLM_ENDPOINT: 'https://api.example.com/v1',
    IMA_LLM_KEY: 'sk-test',
    IMA_LLM_MODEL: 'gpt-test',
  };
  const r = selectLlm(env);
  assert.equal(r.source, 'env');
  assert.equal(r.llm.provider, 'api.example.com');
  assert.equal(r.llm.model, 'gpt-test');
});

void test('selectLlm: partial env falls back to mock with a warning', () => {
  const env: Record<string, string | undefined> = {
    IMA_LLM_ENDPOINT: 'https://api.example.com/v1',
    IMA_LLM_KEY: 'sk-test',
    // IMA_LLM_MODEL missing
  };
  const r = selectLlm(env);
  assert.equal(r.source, 'mock');
  assert.match(r.warning ?? '', /IMA_LLM_MODEL/);
});

void test('selectLlm: probe works with injected fetchImpl (no real network call)', async () => {
  const env: Record<string, string | undefined> = {
    IMA_LLM_ENDPOINT: 'https://api.example.com/v1',
    IMA_LLM_KEY: 'sk-test',
    IMA_LLM_MODEL: 'gpt-test',
  };
  const fakeFetch: typeof fetch = (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: 'pong' } }] }), { status: 200 })) as unknown as typeof fetch;
  const r = selectLlm(env, { fetchImpl: fakeFetch });
  const probe = await r.probe();
  assert.equal(probe.ok, true);
  assert.equal(probe.reachable, true);
  assert.equal(probe.latencyMs >= 0, true);
  assert.equal(probe.sample, 'pong');
});

void test('selectLlm: probe surfaces 5xx as ok=false with status', async () => {
  const env: Record<string, string | undefined> = {
    IMA_LLM_ENDPOINT: 'https://api.example.com/v1',
    IMA_LLM_KEY: 'sk-test',
    IMA_LLM_MODEL: 'gpt-test',
  };
  const fakeFetch: typeof fetch = (async () =>
    new Response('boom', { status: 503 })) as unknown as typeof fetch;
  const r = selectLlm(env, { fetchImpl: fakeFetch });
  const probe = await r.probe();
  assert.equal(probe.ok, false);
  assert.equal(probe.reachable, true); // 5xx means the endpoint is reachable
  assert.equal(probe.retryable, true);
  assert.equal(probe.status, 503);
});

void test('selectLlm: probe detects 429 as retryable unavailable', async () => {
  const env: Record<string, string | undefined> = {
    IMA_LLM_ENDPOINT: 'https://api.example.com/v1',
    IMA_LLM_KEY: 'sk-test',
    IMA_LLM_MODEL: 'gpt-test',
  };
  const fakeFetch: typeof fetch = (async () =>
    new Response('quota', { status: 429 })) as unknown as typeof fetch;
  const r = selectLlm(env, { fetchImpl: fakeFetch });
  const probe = await r.probe();
  assert.equal(probe.ok, false);
  assert.equal(probe.retryable, true);
  assert.equal(probe.status, 429);
});

void test('selectLlm: probe catches network errors and reports unreachable', async () => {
  const env: Record<string, string | undefined> = {
    IMA_LLM_ENDPOINT: 'https://api.example.com/v1',
    IMA_LLM_KEY: 'sk-test',
    IMA_LLM_MODEL: 'gpt-test',
  };
  const fakeFetch: typeof fetch = (async () => { throw new Error('ECONNRESET'); }) as unknown as typeof fetch;
  const r = selectLlm(env, { fetchImpl: fakeFetch });
  const probe = await r.probe();
  assert.equal(probe.ok, false);
  assert.equal(probe.reachable, false);
  assert.match(probe.error ?? '', /ECONNRESET/);
});

void test('selectLlm: override option bypasses env and probe returns ok', async () => {
  const r = selectLlm({}, { override: { provider: 'fixture', model: 'x', async complete() { return 'ok'; } } });
  assert.equal(r.source, 'override');
  assert.equal(r.llm.provider, 'fixture');
  const probe = await r.probe();
  assert.equal(probe.ok, true);
});
