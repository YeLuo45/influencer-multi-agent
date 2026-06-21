import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockLlm, OpenAICompatibleLlm, LlmError, createLlm, isLlmUnavailableError } from '../src/llm.js';

void test('MockLlm: implements Llm interface', () => {
  const llm = new MockLlm();
  assert.equal(llm.provider, 'mock');
  assert.ok(llm.model);
});

void test('createLlm: defaults to MockLlm', () => {
  const llm = createLlm();
  assert.equal(llm.provider, 'mock');
});

void test('createLlm: switches to OpenAICompatible when env provided', () => {
  const llm = createLlm({
    endpoint: 'https://api.example.com/v1',
    apiKey: 'k',
    model: 'm',
  });
  assert.equal(llm.provider, 'api.example.com');
  assert.equal(llm.model, 'm');
});

void test('OpenAICompatibleLlm: builds correct request', async () => {
  let captured: { url: string; init: { method?: string; headers?: Record<string, string>; body?: string } } = { url: '', init: {} };
  const fakeFetch = (async (url: string, init: { method?: string; headers?: Record<string, string>; body?: string }) => {
    captured = { url, init };
    return new Response(JSON.stringify({ choices: [{ message: { content: 'hi' } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const llm = new OpenAICompatibleLlm({
    endpoint: 'https://api.example.com/v1',
    apiKey: 'sk-test',
    model: 'gpt-test',
    fetchImpl: fakeFetch,
  });
  const out = await llm.complete('Hello');
  assert.equal(out, 'hi');
  assert.equal(captured.url, 'https://api.example.com/v1');
  assert.equal(captured.init.method, 'POST');
  assert.equal(captured.init.headers?.['Content-Type'], 'application/json');
  assert.equal(captured.init.headers?.['Authorization'], 'Bearer sk-test');
  const body = JSON.parse(captured.init.body!);
  assert.equal(body.model, 'gpt-test');
  assert.equal(body.messages[0].content, 'Hello');
});

void test('OpenAICompatibleLlm: includes system prompt when provided', async () => {
  let capturedBody = '';
  const fakeFetch = (async (_url: string, init: { body?: string }) => {
    capturedBody = init?.body ?? '';
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const llm = new OpenAICompatibleLlm({
    endpoint: 'https://api.example.com/v1',
    apiKey: 'k',
    model: 'm',
    fetchImpl: fakeFetch,
  });
  await llm.complete('user', { system: 'system prompt' });
  const body = JSON.parse(capturedBody);
  assert.equal(body.messages.length, 2);
  assert.equal(body.messages[0].role, 'system');
  assert.equal(body.messages[0].content, 'system prompt');
});

void test('OpenAICompatibleLlm: throws on 4xx error', async () => {
  const fakeFetch = (async () =>
    new Response('{"error":{"message":"bad key"}}', { status: 401 })) as unknown as typeof fetch;
  const llm = new OpenAICompatibleLlm({
    endpoint: 'https://api.example.com/v1',
    apiKey: 'k',
    model: 'm',
    fetchImpl: fakeFetch,
    maxRetries: 0,
  });
  await assert.rejects(() => llm.complete('x'), /401/);
});

void test('OpenAICompatibleLlm: retries on 5xx', async () => {
  let count = 0;
  const fakeFetch = (async () => {
    count++;
    if (count < 3) return new Response('oops', { status: 503 });
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const llm = new OpenAICompatibleLlm({
    endpoint: 'https://api.example.com/v1',
    apiKey: 'k',
    model: 'm',
    fetchImpl: fakeFetch,
    maxRetries: 2,
    timeoutMs: 1000,
  });
  const out = await llm.complete('x');
  assert.equal(out, 'ok');
  assert.equal(count, 3);
});

void test('OpenAICompatibleLlm: stops retrying after maxRetries', async () => {
  let count = 0;
  const fakeFetch = (async () => {
    count++;
    return new Response('oops', { status: 500 });
  }) as unknown as typeof fetch;
  const llm = new OpenAICompatibleLlm({
    endpoint: 'https://api.example.com/v1',
    apiKey: 'k',
    model: 'm',
    fetchImpl: fakeFetch,
    maxRetries: 1,
    timeoutMs: 1000,
  });
  await assert.rejects(() => llm.complete('x'), /500/);
  assert.equal(count, 2); // initial + 1 retry
});

void test('OpenAICompatibleLlm: throws on missing content', async () => {
  const fakeFetch = (async () =>
    new Response(JSON.stringify({ choices: [] }), { status: 200 })) as unknown as typeof fetch;
  const llm = new OpenAICompatibleLlm({
    endpoint: 'https://api.example.com/v1',
    apiKey: 'k',
    model: 'm',
    fetchImpl: fakeFetch,
    maxRetries: 0,
  });
  await assert.rejects(() => llm.complete('x'), /missing content/);
});

void test('OpenAICompatibleLlm: throws on API error envelope', async () => {
  const fakeFetch = (async () =>
    new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 200 })) as unknown as typeof fetch;
  const llm = new OpenAICompatibleLlm({
    endpoint: 'https://api.example.com/v1',
    apiKey: 'k',
    model: 'm',
    fetchImpl: fakeFetch,
    maxRetries: 0,
  });
  await assert.rejects(() => llm.complete('x'), /rate limited/);
});

void test('OpenAICompatibleLlm: marks 429 as retryable unavailable error', async () => {
  const fakeFetch = (async () =>
    new Response('{"error":{"message":"quota exceeded"}}', { status: 429 })) as unknown as typeof fetch;
  const llm = new OpenAICompatibleLlm({
    endpoint: 'https://api.example.com/v1',
    apiKey: 'k',
    model: 'm',
    fetchImpl: fakeFetch,
    maxRetries: 0,
  });
  await assert.rejects(
    () => llm.complete('x'),
    (err) => {
      assert.equal(isLlmUnavailableError(err), true);
      assert.equal((err as { status?: number }).status, 429);
      assert.equal((err as { retryable?: boolean }).retryable, true);
      return true;
    },
  );
});

void test('OpenAICompatibleLlm: respects temperature option', async () => {
  let captured = '';
  const fakeFetch = (async (_u: string, init: { body?: string }) => {
    captured = init?.body ?? '';
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const llm = new OpenAICompatibleLlm({
    endpoint: 'https://api.example.com/v1',
    apiKey: 'k',
    model: 'm',
    fetchImpl: fakeFetch,
  });
  await llm.complete('x', { temperature: 0.1, maxTokens: 100 });
  const body = JSON.parse(captured);
  assert.equal(body.temperature, 0.1);
  assert.equal(body.max_tokens, 100);
});

void test('OpenAICompatibleLlm: strips trailing slash from endpoint', async () => {
  let url = '';
  const fakeFetch = (async (u: string) => {
    url = u;
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const llm = new OpenAICompatibleLlm({
    endpoint: 'https://api.example.com/v1/',
    apiKey: 'k',
    model: 'm',
    fetchImpl: fakeFetch,
  });
  await llm.complete('x');
  assert.equal(url, 'https://api.example.com/v1');
});

void test('LlmError: includes retryable flag', () => {
  const e = new LlmError('oops', true, 503);
  assert.equal(e.retryable, true);
  assert.equal(e.status, 503);
  assert.equal(e.message, 'oops');
});