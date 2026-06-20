import type { Content, Review } from '../types.js';
import type { Agent, AgentContext, AgentResult } from '../protocol.js';
import { err, ok } from '../protocol.js';

export class ReviewAgent implements Agent<void, Review> {
  name = 'review';

  async run(_input: void, content: Content, _ctx: AgentContext): Promise<AgentResult<Review>> {
    if (!content.draft) return err('draft missing', true);
    try {
      const checks = runChecks(content);
      const failing = checks.filter((c) => !c.pass);
      const decision: Review['decision'] =
        failing.length === 0 ? 'approve' : failing.length >= 3 ? 'reject' : 'revise';
      const review: Review = {
        decision,
        reasons: failing.map((c) => `${c.name}: ${c.note}`),
        checks,
      };
      return ok(review);
    } catch (e) {
      return err(`review failed: ${(e as Error).message}`, true);
    }
  }
}

function runChecks(content: Content): Review['checks'] {
  const draft = content.draft!;
  return [
    {
      name: 'length',
      pass: draft.body.length >= 80,
      note: draft.body.length >= 80 ? `body ${draft.body.length} chars` : 'body 太短',
    },
    {
      name: 'topic_alignment',
      pass: draft.title.includes(content.topic) || draft.body.includes(content.topic),
      note: draft.title.includes(content.topic) || draft.body.includes(content.topic)
        ? 'topic hit'
        : '未匹配 topic',
    },
    {
      name: 'tags_present',
      pass: draft.tags.length >= 2,
      note: `${draft.tags.length} tags`,
    },
    {
      name: 'no_placeholder',
      pass: !/TODO|FIXME|xxx/i.test(`${draft.title}\n${draft.body}`),
      note: /TODO|FIXME|xxx/i.test(`${draft.title}\n${draft.body}`) ? '存在占位符' : 'clean',
    },
  ];
}