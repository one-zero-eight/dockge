import {
    getLanguageService,
    type LanguageService,
} from "yaml-language-server/lib/esm/languageservice/yamlLanguageService.js";
import type { TextDocument } from "vscode-languageserver-textdocument";
import {
    CompletionItemKind,
    type CompletionItem,
    type CompletionList,
    type Diagnostic,
    type Hover,
    type Position,
} from "vscode-languageserver-types";
import { isMap, isScalar, isSeq, parseDocument } from "yaml";
import composeSchema from "./schemas/compose-spec.json";
import { COMPOSE_SCHEMA_URI } from "./yaml-protocol";

/**
 * Soft cold-start prior when the file has little local signal yet.
 * Sibling-service frequency in the current document always outweighs this.
 */
const COMPOSE_KEY_PRIOR: Readonly<Record<string, number>> = {
    image: 8,
    build: 7,
    ports: 7,
    volumes: 7,
    environment: 6,
    depends_on: 6,
    restart: 5,
    command: 5,
    networks: 5,
    env_file: 5,
    container_name: 4,
    healthcheck: 4,
    labels: 3,
    expose: 3,
    entrypoint: 3,
    profiles: 3,
    deploy: 3,
    working_dir: 2,
    user: 2,
    secrets: 2,
    configs: 2,
    pull_policy: 2,
};

const telemetry = {
    send() {
        // no-op
    },
    sendError(name: string, error: unknown) {
        console.error("yaml-language-service", name, error);
    },
    sendTrack() {
        // no-op
    },
};

/**
 * Compose custom tags used by the Compose Specification merge/override model.
 * Format follows yaml-language-server customTags settings.
 */
const COMPOSE_CUSTOM_TAGS = [
    "!reset",
    "!override",
    "!reset mapping",
    "!override mapping",
    "!reset sequence",
    "!override sequence",
    "!reset scalar",
    "!override scalar",
];

export function createComposeLanguageService(): LanguageService {
    const ls = getLanguageService({
        // Offline only: never fetch remote schemas.
        // @ts-expect-error schemaRequestService may be null when disabled
        schemaRequestService: null,
        workspaceContext: {
            resolveRelativePath(relativePath: string, resource: string) {
                return String(new URL(relativePath, resource));
            },
        },
        telemetry,
        clientCapabilities: {
            textDocument: {
                completion: {
                    completionItem: {
                        documentationFormat: [ "markdown", "plaintext" ],
                        snippetSupport: true,
                    },
                },
                hover: {
                    contentFormat: [ "markdown", "plaintext" ],
                },
            },
        },
    });

    ls.configure({
        validate: true,
        hover: true,
        completion: true,
        format: true,
        yamlVersion: "1.2",
        customTags: COMPOSE_CUSTOM_TAGS,
        hoverSchemaSource: false,
        schemas: [
            {
                uri: COMPOSE_SCHEMA_URI,
                fileMatch: [
                    "**/compose.yaml",
                    "**/compose.yml",
                    "**/docker-compose.yaml",
                    "**/docker-compose.yml",
                    "**/compose.*.yaml",
                    "**/compose.*.yml",
                    "**/docker-compose.*.yaml",
                    "**/docker-compose.*.yml",
                ],
                schema: composeSchema as Record<string, unknown>,
            },
        ],
    });

    return ls;
}

export async function validateComposeDocument(
    ls: LanguageService,
    document: TextDocument
): Promise<Diagnostic[]> {
    return ls.doValidation(document, false);
}

/** Line prefix looks like a mapping key (indent + optional partial key, no `:`). */
export function isMappingKeyLinePrefix(linePrefix: string): boolean {
    return /^\s*[\w./-]*$/.test(linePrefix);
}

/** Line prefix looks like a mapping value (`key:` then optional value text). */
export function isMappingValueLinePrefix(linePrefix: string): boolean {
    return /^\s*[^#\s][^:]*:\s*/.test(linePrefix);
}

function completionLabel(item: CompletionItem): string {
    return typeof item.label === "string" ? item.label : item.label.label;
}

/**
 * Drop contextually irrelevant LSP completions without hardcoding Compose keys:
 * - key positions: YAML tags (`!*`) are value-only
 * - value positions: schema Property keys do not belong after `:`
 */
export function refineComposeCompletions(
    document: TextDocument,
    position: Position,
    items: CompletionItem[]
): CompletionItem[] {
    const linePrefix = document.getText({
        start: { line: position.line,
            character: 0 },
        end: position,
    });

    if (isMappingValueLinePrefix(linePrefix)) {
        return items.filter((item) => item.kind !== CompletionItemKind.Property);
    }

    if (isMappingKeyLinePrefix(linePrefix)) {
        return items.filter((item) => !completionLabel(item).startsWith("!"));
    }

    return items;
}

/** Count mapping keys in the document (used to boost keys already common in siblings). */
export function countMappingKeyFrequency(text: string): Map<string, number> {
    const counts = new Map<string, number>();
    const visit = (node: unknown): void => {
        if (isMap(node)) {
            for (const item of node.items) {
                if (isScalar(item.key) && item.key.value != null) {
                    const key = String(item.key.value);
                    counts.set(key, (counts.get(key) ?? 0) + 1);
                }
                visit(item.value);
            }
            return;
        }
        if (isSeq(node)) {
            for (const item of node.items) {
                visit(item);
            }
        }
    };
    visit(parseDocument(text).contents);
    return counts;
}

/**
 * Rank completions: keys used elsewhere in this file rise first;
 * a light prior breaks ties on empty / first-service files.
 * Sets LSP `sortText` (ascending) for CodeMirror boost mapping.
 */
export function rankComposeCompletions(text: string, items: CompletionItem[]): CompletionItem[] {
    const freq = countMappingKeyFrequency(text);
    return items
        .map((item) => {
            const label = completionLabel(item);
            const score = (freq.get(label) ?? 0) * 10 + (COMPOSE_KEY_PRIOR[label] ?? 0);
            return {
                ...item,
                sortText: String(10000 - score).padStart(5, "0"),
            };
        })
        .sort((a, b) => (a.sortText ?? "").localeCompare(b.sortText ?? "") || completionLabel(a).localeCompare(completionLabel(b)));
}

/** Map ranking sortText to a CodeMirror completion boost (-99..99). */
export function composeCompletionBoost(sortText: string | undefined): number | undefined {
    if (!sortText || !/^\d+$/.test(sortText)) {
        return undefined;
    }
    const score = 10000 - Number.parseInt(sortText, 10);
    return Math.max(-99, Math.min(99, score));
}

export async function completeComposeDocument(
    ls: LanguageService,
    document: TextDocument,
    position: Position
): Promise<CompletionList | null> {
    const result = await ls.doComplete(document, position, false);
    if (!result) {
        return null;
    }
    const refined = refineComposeCompletions(document, position, result.items);
    return {
        ...result,
        items: rankComposeCompletions(document.getText(), refined),
    };
}

export async function hoverComposeDocument(
    ls: LanguageService,
    document: TextDocument,
    position: Position
): Promise<Hover | null> {
    return ls.doHover(document, position);
}
