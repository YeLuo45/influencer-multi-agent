export interface Llm {
    complete(prompt: string, opts?: {
        system?: string;
        maxTokens?: number;
        temperature?: number;
    }): Promise<string>;
    readonly provider: string;
    readonly model: string;
}
export declare class MockLlm implements Llm {
    readonly provider = "mock";
    readonly model = "mock-llm-v1";
    complete(prompt: string, _opts?: {
        system?: string;
        maxTokens?: number;
        temperature?: number;
    }): Promise<string>;
}
export interface OpenAICompatibleOptions {
    endpoint: string;
    apiKey: string;
    model: string;
    /** http timeout in ms, default 30000 */
    timeoutMs?: number;
    /** max retry attempts, default 2 (so 3 total tries) */
    maxRetries?: number;
    /** fetch override for testing */
    fetchImpl?: typeof fetch;
}
export declare class OpenAICompatibleLlm implements Llm {
    readonly provider: string;
    readonly model: string;
    private readonly endpoint;
    private readonly apiKey;
    private readonly timeoutMs;
    private readonly maxRetries;
    private readonly fetchImpl;
    constructor(opts: OpenAICompatibleOptions);
    complete(prompt: string, opts?: {
        system?: string;
        maxTokens?: number;
        temperature?: number;
    }): Promise<string>;
    private callOnce;
}
export declare class LlmError extends Error {
    readonly retryable: boolean;
    readonly status?: number | undefined;
    constructor(message: string, retryable: boolean, status?: number | undefined);
}
export interface CreateLlmOptions {
    endpoint?: string;
    apiKey?: string;
    model?: string;
    timeoutMs?: number;
    maxRetries?: number;
    fetchImpl?: typeof fetch;
}
export declare function createLlm(opts?: CreateLlmOptions): Llm;
//# sourceMappingURL=llm.d.ts.map