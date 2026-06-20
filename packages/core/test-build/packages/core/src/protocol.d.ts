import type { Content, HistoryEntry, PlatformId, PostRecord, Source } from './types.js';
export type AgentResult<T> = {
    kind: 'ok';
    data: T;
} | {
    kind: 'error';
    message: string;
    recoverable: boolean;
} | {
    kind: 'needs-input';
    question: string;
    options?: string[];
};
export interface CrawlerLike {
    fetch(url: string, opts?: {
        render?: 'static' | 'js';
    }): Promise<{
        url: string;
        title: string;
        markdown: string;
    }>;
}
export interface PublisherLike {
    post(platform: PlatformId, content: {
        title: string;
        body: string;
        tags: string[];
    }): Promise<PostRecord>;
    healthCheck(platform: PlatformId): Promise<{
        ok: boolean;
        detail: string;
    }>;
}
export interface AgentContext {
    llm: {
        complete(prompt: string, opts?: {
            system?: string;
            maxTokens?: number;
        }): Promise<string>;
    };
    crawler: CrawlerLike;
    publisher: PublisherLike;
    now(): string;
}
export interface Agent<I, O> {
    name: string;
    run(input: I, content: Content, ctx: AgentContext): Promise<AgentResult<O>>;
}
export declare function makeHistoryEntry(from: Content['stage'], to: Content['stage'], agent: string, note: string, now: string): HistoryEntry;
export declare function ok<T>(data: T): AgentResult<T>;
export declare function err(message: string, recoverable?: boolean): AgentResult<never>;
export declare function needInput(question: string, options?: string[]): AgentResult<never>;
export declare function sourceToString(s: Source): string;
//# sourceMappingURL=protocol.d.ts.map