import type { ContentStage, HistoryEntry } from './types.js';

export class InvalidTransition extends Error {
  constructor(from: ContentStage | 'paused', to: ContentStage | 'paused') {
    super(`Invalid transition: ${from} -> ${to}`);
    this.name = 'InvalidTransition';
  }
}

export const PAUSED_STAGE = 'paused' as const;
export type AllStages = ContentStage | typeof PAUSED_STAGE;

export const TRANSITIONS: Readonly<Record<AllStages, readonly AllStages[]>> = Object.freeze({
  intake: ['research', 'paused'],
  research: ['ideas', 'paused'],
  ideas: ['draft', 'paused'],
  draft: ['review', 'paused'],
  review: ['publish', 'needs_revision', 'paused'],
  needs_revision: ['draft', 'paused'],
  publish: ['done', 'needs_revision', 'paused'],
  done: ['paused'],
  paused: ['intake', 'research', 'ideas', 'draft', 'review', 'needs_revision', 'publish'],
});

const STAGE_ORDER: Record<AllStages, number> = {
  intake: 0, research: 1, ideas: 2, draft: 3, review: 4, needs_revision: 5, publish: 6, done: 7, paused: -1,
};

export function nextStages(from: AllStages): readonly AllStages[] {
  return TRANSITIONS[from];
}

export function canTransition(from: AllStages, to: AllStages): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: AllStages, to: AllStages): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransition(from, to);
  }
}

export function isTerminal(stage: ContentStage): boolean {
  // A stage is lifecycle-terminal when it has no outgoing lifecycle edge.
  // The `paused` super-stage is intentionally excluded from this check so
  // existing pipeline loops (`while (!isTerminal(cur.stage))`) keep their
  // v0.9 semantics: `done` still ends the run, and pausing a `done`
  // content requires an explicit operator action.
  return TRANSITIONS[stage].filter((t) => t !== PAUSED_STAGE).length === 0;
}

export function isPaused(stage: AllStages): boolean {
  return stage === 'paused';
}

export function stageRank(a: AllStages, b: AllStages): number {
  return STAGE_ORDER[a] - STAGE_ORDER[b];
}

export interface SetStageInput {
  stage: ContentStage;
  history: HistoryEntry[];
  updatedAt?: string;
}

export function setStage<T extends SetStageInput>(content: T, to: ContentStage | 'paused', note: string, now: () => string): T {
  const from = content.stage;
  return {
    ...content,
    stage: to as ContentStage,
    updatedAt: now(),
    history: [...content.history, { from, to, agent: 'state-machine', note, at: now() }],
  };
}