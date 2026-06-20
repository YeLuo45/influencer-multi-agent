export interface Llm {
    complete(prompt: string, opts?: {
        system?: string;
        maxTokens?: number;
    }): Promise<string>;
}
export declare class MockLlm implements Llm {
    complete(prompt: string, _opts?: {
        system?: string;
        maxTokens?: number;
    }): Promise<string>;
}
export declare class OpenAICompatibleLlm implements Llm {
    private readonly endpoint;
    private readonly apiKey;
    private readonly model;
    constructor(endpoint: string, apiKey: string, model: string);
    complete(prompt: string, opts?: {
        system?: string;
        maxTokens?: number;
    }): Promise<string>;
}
export declare function createLlm(): Llm;
//# sourceMappingURL=llm.d.ts.map