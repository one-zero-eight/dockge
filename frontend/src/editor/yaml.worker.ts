import { TextDocument } from "vscode-languageserver-textdocument";
import {
    completeComposeDocument,
    createComposeLanguageService,
    formatComposeDocument,
    hoverComposeDocument,
    validateComposeDocument,
} from "./yaml-service";
import type { YamlRequest, YamlResponse } from "./yaml-protocol";

const languageService = createComposeLanguageService();

self.onmessage = async (event: MessageEvent<YamlRequest>) => {
    const request = event.data;
    try {
        const document = TextDocument.create(
            request.uri,
            "yaml",
            request.version,
            request.text
        );

        let response: YamlResponse;
        if (request.type === "validate") {
            const diagnostics = await validateComposeDocument(languageService, document);
            response = {
                type: "validate",
                id: request.id,
                version: request.version,
                diagnostics,
            };
        } else if (request.type === "complete") {
            const result = await completeComposeDocument(
                languageService,
                document,
                request.position
            );
            response = {
                type: "complete",
                id: request.id,
                version: request.version,
                result,
            };
        } else if (request.type === "format") {
            const edits = await formatComposeDocument(languageService, document);
            response = {
                type: "format",
                id: request.id,
                version: request.version,
                edits,
            };
        } else {
            const result = await hoverComposeDocument(
                languageService,
                document,
                request.position
            );
            response = {
                type: "hover",
                id: request.id,
                version: request.version,
                result,
            };
        }
        self.postMessage(response);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const response: YamlResponse = {
            type: "error",
            id: request.id,
            message,
        };
        self.postMessage(response);
    }
};
