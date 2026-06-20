export declare class JsonStore {
    readonly root: string;
    constructor(opts?: {
        cwd?: string;
        rootDir?: string;
    });
    path(...parts: string[]): string;
    read<T>(rel: string): Promise<T | null>;
    write<T>(rel: string, data: T): Promise<void>;
    list(dir: string): Promise<string[]>;
    remove(rel: string): Promise<void>;
}
//# sourceMappingURL=storage.d.ts.map