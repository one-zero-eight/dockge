import type {
    CompletionList,
    Diagnostic,
    Hover,
    Position,
    TextEdit,
} from "vscode-languageserver-types";

export const COMPOSE_SCHEMA_URI = "https://compose-spec.io/compose-spec.json";
export const COMPOSE_DOCUMENT_URI = "file:///compose.yaml";

export type YamlRequest =
    | {
        type: "validate";
        id: number;
        uri: string;
        version: number;
        text: string;
    }
    | {
        type: "complete";
        id: number;
        uri: string;
        version: number;
        text: string;
        position: Position;
    }
    | {
        type: "hover";
        id: number;
        uri: string;
        version: number;
        text: string;
        position: Position;
    }
    | {
        type: "format";
        id: number;
        uri: string;
        version: number;
        text: string;
    };

export type YamlResponse =
    | {
        type: "validate";
        id: number;
        version: number;
        diagnostics: Diagnostic[];
    }
    | {
        type: "complete";
        id: number;
        version: number;
        result: CompletionList | null;
    }
    | {
        type: "hover";
        id: number;
        version: number;
        result: Hover | null;
    }
    | {
        type: "format";
        id: number;
        version: number;
        edits: TextEdit[];
    }
    | {
        type: "error";
        id: number;
        message: string;
    };
