export class InvalidTransition extends Error {
    constructor(from, to) {
        super(`Invalid transition: ${from} -> ${to}`);
        this.name = 'InvalidTransition';
    }
}
export const TRANSITIONS = Object.freeze({
    intake: ['research'],
    research: ['ideas'],
    ideas: ['draft'],
    draft: ['review'],
    review: ['publish', 'needs_revision'],
    needs_revision: ['draft'],
    publish: ['done', 'needs_revision'],
    done: [],
});
export function nextStages(from) {
    return TRANSITIONS[from];
}
export function canTransition(from, to) {
    return TRANSITIONS[from].includes(to);
}
export function assertTransition(from, to) {
    if (!canTransition(from, to)) {
        throw new InvalidTransition(from, to);
    }
}
export function isTerminal(stage) {
    return TRANSITIONS[stage].length === 0;
}
//# sourceMappingURL=state-machine.js.map