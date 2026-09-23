import {
    getLanguageService,
    type LanguageService,
} from "yaml-language-server/lib/esm/languageservice/yamlLanguageService.js";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type {
    CompletionList,
    Diagnostic,
    Hover,
    Position,
} from "vscode-languageserver-types";
import composeSchema from "./schemas/compose-spec.json";
import { COMPOSE_SCHEMA_URI } from "./yaml-protocol";

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
        format: false,
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

export async function completeComposeDocument(
    ls: LanguageService,
    document: TextDocument,
    position: Position
): Promise<CompletionList | null> {
    return ls.doComplete(document, position, false);
}

export async function hoverComposeDocument(
    ls: LanguageService,
    document: TextDocument,
    position: Position
): Promise<Hover | null> {
    return ls.doHover(document, position);
}
