import type {
    CompletionList,
    Diagnostic,
    Hover,
    Position,
    TextEdit,
} from "vscode-languageserver-types";
import { COMPOSE_DOCUMENT_URI, type YamlRequest, type YamlResponse } from "./yaml-protocol";

type Pending = {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
    version: number;
};

/**
 * Browser client for the Compose YAML language-service worker.
 * Rejects stale replies whose document version no longer matches.
 */
export class YamlLanguageClient {
    private worker: Worker | null = null;
    private nextId = 1;
    private pending = new Map<number, Pending>();
    private disposed = false;

    constructor(
        private readonly documentUri = COMPOSE_DOCUMENT_URI,
        private readonly createWorker: () => Worker = () =>
            new Worker(new URL("./yaml.worker.ts", import.meta.url), {
                type: "module",
            })
    ) {}

    private ensureWorker(): Worker {
        if (this.disposed) {
            throw new Error("YAML language client is disposed");
        }
        if (!this.worker) {
            this.worker = this.createWorker();
            this.worker.onmessage = (event: MessageEvent<YamlResponse>) => {
                this.handleResponse(event.data);
            };
            this.worker.onerror = (event) => {
                const message = event.message || "YAML language worker error";
                for (const [ id, entry ] of this.pending) {
                    entry.reject(new Error(message));
                    this.pending.delete(id);
                }
            };
        }
        return this.worker;
    }

    private handleResponse(response: YamlResponse): void {
        const entry = this.pending.get(response.id);
        if (!entry) {
            return;
        }
        this.pending.delete(response.id);

        if (response.type === "error") {
            entry.reject(new Error(response.message));
            return;
        }

        if (response.version !== entry.version) {
            entry.reject(new StaleResponseError(response.version, entry.version));
            return;
        }

        switch (response.type) {
            case "validate":
                entry.resolve(response.diagnostics);
                break;
            case "complete":
                entry.resolve(response.result);
                break;
            case "hover":
                entry.resolve(response.result);
                break;
            case "format":
                entry.resolve(response.edits);
                break;
        }
    }

    private request<T>(payload: YamlRequest): Promise<T> {
        const worker = this.ensureWorker();
        return new Promise<T>((resolve, reject) => {
            this.pending.set(payload.id, {
                resolve: resolve as (value: unknown) => void,
                reject,
                version: payload.version,
            });
            worker.postMessage(payload);
        });
    }

    validate(text: string, version: number): Promise<Diagnostic[]> {
        return this.request<Diagnostic[]>({
            type: "validate",
            id: this.nextId++,
            uri: this.documentUri,
            version,
            text,
        });
    }

    complete(text: string, version: number, position: Position): Promise<CompletionList | null> {
        return this.request<CompletionList | null>({
            type: "complete",
            id: this.nextId++,
            uri: this.documentUri,
            version,
            text,
            position,
        });
    }

    hover(text: string, version: number, position: Position): Promise<Hover | null> {
        return this.request<Hover | null>({
            type: "hover",
            id: this.nextId++,
            uri: this.documentUri,
            version,
            text,
            position,
        });
    }

    format(text: string, version: number): Promise<TextEdit[]> {
        return this.request<TextEdit[]>({
            type: "format",
            id: this.nextId++,
            uri: this.documentUri,
            version,
            text,
        });
    }

    dispose(): void {
        this.disposed = true;
        for (const [ id, entry ] of this.pending) {
            entry.reject(new Error("YAML language client disposed"));
            this.pending.delete(id);
        }
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
    }
}

export class StaleResponseError extends Error {
    constructor(
        readonly responseVersion: number,
        readonly expectedVersion: number
    ) {
        super(`Stale YAML language response (got ${responseVersion}, expected ${expectedVersion})`);
        this.name = "StaleResponseError";
    }
}
