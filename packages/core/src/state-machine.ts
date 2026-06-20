import type { ContentStage } from './types.js';

export class InvalidTransition extends Error {
  constructor(from: ContentStage, to: ContentStage) {
    super(`Invalid transition: ${from} -> ${to}`);
    this.name = 'InvalidTransition';
  }
}

export const TRANSITIONS: Readonly<Record<ContentStage, readonly ContentStage[]>> = Object.freeze({
  intake: ['research'],
  research: ['ideas'],
  ideas: ['draft'],
  draft: ['review'],
  review: ['publish', 'needs_revision'],
  needs_revision: ['draft'],
  publish: ['done', 'needs_revision'],
  done: [],
});

export function nextStages(from: ContentStage): readonly ContentStage[] {
  return TRANSITIONS[from];
}

export function canTransition(from: ContentStage, to: ContentStage): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: ContentStage, to: ContentStage): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransition(from, to);
  }
}

export function isTerminal(stage: ContentStage): boolean {
  return TRANSITIONS[stage].length === 0;
}