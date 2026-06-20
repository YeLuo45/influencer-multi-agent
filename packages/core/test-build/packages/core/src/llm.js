export class MockLlm {
    async complete(prompt, _opts) {
        const lower = prompt.toLowerCase();
        if (lower.includes('title')) {
            const topic = extractTopic(prompt);
            return `【大 V 视角】${topic}：3 个被低估的真相`;
        }
        if (lower.includes('body') || lower.includes('post')) {
            const topic = extractTopic(prompt);
            return [
                `我观察到，${topic} 正在成为新的爆款主线。`,
                `为什么？三个信号：1) 流量结构变化；2) 用户行为分层；3) 平台规则迭代。`,
                `机会在哪？把"老问题"用新工具重做一次。`,
                `#${topic} #大V观察`,
            ].join('\n');
        }
        if (lower.includes('ideas') || lower.includes('angles')) {
            return JSON.stringify([
                { angle: `${extractTopic(prompt)} 的反共识观点`, hook: '99% 的人忽略了这一点', score: 0.82 },
                { angle: `${extractTopic(prompt)} 的实操 3 步法`, hook: '亲测有效，照做就行', score: 0.76 },
                { angle: `${extractTopic(prompt)} 的踩坑指南`, hook: '这些坑我替你踩过了', score: 0.71 },
            ]);
        }
        if (lower.includes('snippet') || lower.includes('summary')) {
            return `${extractTopic(prompt)} 关键信号已捕获，准备进入下一阶段。`;
        }
        return `[mock-llm] ${extractTopic(prompt)} 完成。`;
    }
}
export class OpenAICompatibleLlm {
    endpoint;
    apiKey;
    model;
    constructor(endpoint, apiKey, model) {
        this.endpoint = endpoint;
        this.apiKey = apiKey;
        this.model = model;
    }
    async complete(prompt, opts) {
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
        const data = (await resp.json());
        const text = data.choices?.[0]?.message?.content;
        if (!text)
            throw new Error('LLM response missing content');
        return text;
    }
}
export function createLlm() {
    const endpoint = process.env['IMA_LLM_ENDPOINT'];
    const key = process.env['IMA_LLM_KEY'];
    const model = process.env['IMA_LLM_MODEL'];
    if (endpoint && key && model) {
        return new OpenAICompatibleLlm(endpoint, key, model);
    }
    return new MockLlm();
}
function extractTopic(prompt) {
    const m = prompt.match(/topic[:：]\s*([^\n,，。]+)/i);
    if (m && m[1])
        return m[1].trim();
    const first = prompt.split('\n').find((l) => l.trim().length > 0) ?? '';
    return first.slice(0, 32).trim();
}
//# sourceMappingURL=llm.js.map