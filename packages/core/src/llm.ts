export interface Llm {
  complete(prompt: string, opts?: { system?: string; maxTokens?: number }): Promise<string>;
}

export class MockLlm implements Llm {
  async complete(prompt: string, _opts?: { system?: string; maxTokens?: number }): Promise<string> {
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
    return `[mock-llm] ${extractTopic(prompt)} 完成。`;
  }
}

export class OpenAICompatibleLlm implements Llm {
  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async complete(prompt: string, opts?: { system?: string; maxTokens?: number }): Promise<string> {
    const body = {
      model: this.model,
      max_tokens: opts?.maxTokens ?? 512,
      messages: [
        ...(opts?.system ? [{ role: 'system', content: opts.system }] : []),
        { role: 'user', content: prompt },
      ],
    };
    const resp = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      throw new Error(`LLM ${resp.status}: ${await resp.text()}`);
    }
    const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('LLM response missing content');
    return text;
  }
}

export function createLlm(): Llm {
  const endpoint = process.env['IMA_LLM_ENDPOINT'];
  const key = process.env['IMA_LLM_KEY'];
  const model = process.env['IMA_LLM_MODEL'];
  if (endpoint && key && model) {
    return new OpenAICompatibleLlm(endpoint, key, model);
  }
  return new MockLlm();
}

function extractTopic(prompt: string): string {
  const m = prompt.match(/topic[:：]\s*([^\n,，。]+)/i);
  if (m && m[1]) return m[1].trim();
  const first = prompt.split('\n').find((l) => l.trim().length > 0) ?? '';
  return first.slice(0, 32).trim();
}