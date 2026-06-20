import type { ContentStage } from './types.js';
export declare class InvalidTransition extends Error {
    constructor(from: ContentStage, to: ContentStage);
}
export declare const TRANSITIONS: Readonly<Record<ContentStage, readonly ContentStage[]>>;
export declare function nextStages(from: ContentStage): readonly ContentStage[];
export declare function canTransition(from: ContentStage, to: ContentStage): boolean;
export declare function assertTransition(from: ContentStage, to: ContentStage): void;
export declare function isTerminal(stage: ContentStage): boolean;
//# sourceMappingURL=state-machine.d.ts.map