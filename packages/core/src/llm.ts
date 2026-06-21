export interface Llm {
  complete(prompt: string, opts?: { system?: string; maxTokens?: number; temperature?: number }): Promise<string>;
  readonly provider: string;
  readonly model: string;
}

export class MockLlm implements Llm {
  readonly provider = 'mock';
  readonly model = 'mock-llm-v1';
  async complete(prompt: string, _opts?: { system?: string; maxTokens?: number; temperature?: number }): Promise<string> {
    const lower = prompt.toLowerCase();
    if (lower.includes('generate a chinese title')) {
      const topic = extractTopic(prompt);
      return `【大 V 视角】${topic}：3 个被低估的真相`;
    }
    if (lower.includes('write a 200-word chinese post body')) {
      const topic = extractTopic(prompt);
      return [
        `我观察到，${topic} 正在成为新的爆款主线。`,
        `为什么？三个核心信号：1) 流量结构正在从搜索转向推荐，触达效率倍增；2) 用户行为分层，专业用户更愿意为高质量内容付费；3) 平台规则迭代，新算法对优质原创更友好。`,
        `机会在哪？把"老问题"用新工具重做一次。普通玩家用 AI 工具降本，资深玩家用 AI 工具提质；前者拼执行力，后者拼判断力。`,
        `关键动作：先选一个细分场景跑通闭环，再横向扩展到 3-5 个相似场景，最后沉淀成可复用的 SOP。`,
        `#${topic.replace(/\s+/g, '')} #大V观察 #内容创作`,
      ].join('\n');
    }
    if (lower.includes('return json array of ideas')) {
      return JSON.stringify([
        { angle: `${extractTopic(prompt)} 的反共识观点`, hook: '99% 的人忽略了这一点', score: 0.82 },
        { angle: `${extractTopic(prompt)} 的实操 3 步法`, hook: '亲测有效，照做就行', score: 0.76 },
        { angle: `${extractTopic(prompt)} 的踩坑指南`, hook: '这些坑我替你踩过了', score: 0.71 },
      ]);
    }
    if (lower.includes('extract 3 signals')) {
      return '1) Adoption is accelerating\n2) Cost is dropping\n3) More use cases emerging';
    }
    if (lower.includes('translate to english')) {
      const topic = extractTopic(prompt);
      return `【Insider View】${topic}: 3 Underrated Truths`;
    }
    if (lower.includes('translate to japanese')) {
      const topic = extractTopic(prompt);
      return `【インサイダー視点】${topic}：見落とされている3つの真実`;
    }
    if (lower.includes('platform-specific rewrite') || lower.includes('adapt for platform')) {
      const platformMatch = prompt.match(/platform:\s*(\w+)/i);
      const platform = platformMatch ? platformMatch[1] : 'x';
      const bodyMatch = prompt.match(/body:\s*([\s\S]+?)\n\nConstraints:/i);
      const body = bodyMatch ? bodyMatch[1].trim() : '(body)';
      if (platform === 'xiaohongshu') {
        return `姐妹们！${body.slice(0, 100)}\n\n🌟 重点来了\n\n${body}\n\n#种草 #安利 ❤️`;
      }
      if (platform === 'bilibili') {
        return `${body}\n\n======\n一键三连支持一下～`;
      }
      if (platform === 'weibo') {
        return `${body.slice(0, 140)}\n\n...全文👇`;
      }
      if (platform === 'x') {
        return body.length > 240 ? body.slice(0, 237) + '...' : body;
      }
      return body;
    }
    return `[mock-llm] ${extractTopic(prompt)} 完成。`;
  }
}

export interface OpenAICompatibleOptions {
  endpoint: string;
  apiKey: string;
  model: string;
  /** http timeout in ms, default 30000 */
  timeoutMs?: number;
  /** max retry attempts, default 2 (so 3 total tries) */
  maxRetries?: number;
  /** fetch override for testing */
  fetchImpl?: typeof fetch;
}

export class OpenAICompatibleLlm implements Llm {
  readonly provider: string;
  readonly model: string;
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OpenAICompatibleOptions) {
    this.endpoint = opts.endpoint.replace(/\/$/, '');
    this.apiKey = opts.apiKey;
    this.model = opts.model;
    this.provider = inferProvider(opts.endpoint);
    this.timeoutMs = opts.timeoutMs ?? 30000;
    this.maxRetries = opts.maxRetries ?? 2;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async complete(prompt: string, opts?: { system?: string; maxTokens?: number; temperature?: number }): Promise<string> {
    const body = {
      model: this.model,
      max_tokens: opts?.maxTokens ?? 512,
      temperature: opts?.temperature ?? 0.7,
      messages: [
        ...(opts?.system ? [{ role: 'system', content: opts.system }] : []),
        { role: 'user', content: prompt },
      ],
    };
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const resp = await this.callOnce(body);
        return resp;
      } catch (e) {
        lastErr = e as Error;
        if (!isRetryable(lastErr) || attempt === this.maxRetries) break;
        // exponential backoff: 200ms, 600ms, 1.8s
        await sleep(200 * Math.pow(3, attempt));
      }
    }
    throw lastErr ?? new Error('LLM request failed without error');
  }

  private async callOnce(body: { model: string; max_tokens: number; temperature: number; messages: Array<{ role: string; content: string }> }): Promise<string> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const resp = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        const err = new Error(`LLM ${resp.status}: ${text.slice(0, 500)}`);
        (err as Error & { status?: number; retryable?: boolean }).status = resp.status;
        (err as Error & { status?: number; retryable?: boolean }).retryable = resp.status >= 500 || resp.status === 429;
        throw err;
      }
      const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
      if (data.error) throw new Error(`LLM API error: ${data.error.message ?? 'unknown'}`);
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error('LLM response missing content (choices[0].message.content)');
      return text;
    } finally {
      clearTimeout(timer);
    }
  }
}

export class LlmError extends Error {
  constructor(message: string, public readonly retryable: boolean, public readonly status?: number) {
    super(message);
    this.name = 'LlmError';
  }
}

function inferProvider(endpoint: string): string {
  try {
    const u = new URL(endpoint);
    return u.hostname;
  } catch {
    return 'unknown';
  }
}

function isRetryable(err: Error): boolean {
  const r = (err as Error & { retryable?: boolean }).retryable;
  if (typeof r === 'boolean') return r;
  // network errors / abort / timeouts are retryable
  return err.name === 'AbortError' || err.message.includes('fetch failed') || err.message.includes('ECONNRESET');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface CreateLlmOptions {
  endpoint?: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
}

export function createLlm(opts: CreateLlmOptions = {}): Llm {
  const endpoint = opts.endpoint ?? process.env['IMA_LLM_ENDPOINT'];
  const apiKey = opts.apiKey ?? process.env['IMA_LLM_KEY'];
  const model = opts.model ?? process.env['IMA_LLM_MODEL'];
  if (endpoint && apiKey && model) {
    return new OpenAICompatibleLlm({
      endpoint,
      apiKey,
      model,
      ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
      ...(opts.maxRetries !== undefined ? { maxRetries: opts.maxRetries } : {}),
      ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    });
  }
  return new MockLlm();
}

function extractTopic(prompt: string): string {
  const m = prompt.match(/topic[:：]\s*([^\n,，。]+)/i);
  if (m && m[1]) return m[1].trim();
  const first = prompt.split('\n').find((l) => l.trim().length > 0) ?? '';
  return first.slice(0, 32).trim();
}