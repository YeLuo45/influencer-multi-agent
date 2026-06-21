import { err, ok } from '../protocol.js';
import { applyPersonaToPrompt } from '../persona.js';
export class DraftAgent {
    name = 'draft';
    async run(input, content, ctx) {
        if (content.ideas.length === 0)
            return err('no ideas available', true);
        try {
            const idx = clamp(input.ideaIndex ?? 0, 0, content.ideas.length - 1);
            const idea = content.ideas[idx];
            const persona = input.persona ?? null;
            const titlePrompt = applyPersonaIfPersona(persona, `topic: ${content.topic}\npersona: ${content.persona}\nidea angle: ${idea.angle}\nhook: ${idea.hook}\nGenerate a Chinese title.`);
            const bodyPrompt = applyPersonaIfPersona(persona, `topic: ${content.topic}\npersona: ${content.persona}\ntitle: PLACEHOLDER\nangle: ${idea.angle}\nWrite a 200-word Chinese post body.`);
            const title = await ctx.llm.complete(titlePrompt, { maxTokens: 80 });
            const bodyPromptWithTitle = bodyPrompt.replace('PLACEHOLDER', title);
            const body = await ctx.llm.complete(bodyPromptWithTitle, { maxTokens: 500 });
            const draft = {
                title: title.trim(),
                body: body.trim(),
                tags: deriveTags(content.topic, persona),
                coverHint: `${content.topic} ${idea.angle}（视觉建议：3:4 比例，重点突出）`,
                cta: '评论区聊聊你踩过哪些坑 👇',
                platformOverrides: {},
            };
            return ok(draft);
        }
        catch (e) {
            return err(`draft failed: ${e.message}`, true);
        }
    }
}
function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
}
function deriveTags(topic, persona) {
    const tags = new Set();
    tags.add(`#${topic.replace(/\s+/g, '')}`);
    tags.add('#大V观察');
    tags.add('#热点');
    if (persona) {
        for (const phrase of persona.signaturePhrases.slice(0, 2)) {
            tags.add(`#${phrase.replace(/\s+/g, '').slice(0, 16)}`);
        }
    }
    return Array.from(tags);
}
function applyPersonaIfPersona(persona, prompt) {
    return persona ? applyPersonaToPrompt(persona, prompt) : prompt;
}
//# sourceMappingURL=draft.js.map