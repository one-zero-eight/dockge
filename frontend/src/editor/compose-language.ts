import {
    autocompletion,
    completionKeymap,
    insertCompletionText,
    snippet,
    type Completion,
    type CompletionContext,
    type CompletionResult,
} from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import { linter, type Diagnostic as CmDiagnostic } from "@codemirror/lint";
import { StateField, type EditorState, type Extension, type Text } from "@codemirror/state";
import {
    EditorView,
    hoverTooltip,
    keymap,
    ViewPlugin,
    type ViewUpdate,
} from "@codemirror/view";
import {
    InsertTextFormat,
    type CompletionItem,
    type Diagnostic,
    type Hover,
    type MarkupContent as MarkupContentType,
    type Position,
} from "vscode-languageserver-types";
import { StaleResponseError, YamlLanguageClient } from "./yaml-client";
import { composeCompletionBoost } from "./yaml-service";

function offsetToPosition(doc: Text, offset: number): Position {
    const line = doc.lineAt(offset);
    return {
        line: line.number - 1,
        character: offset - line.from,
    };
}

function positionToOffset(doc: Text, position: Position): number {
    const lineNumber = Math.min(Math.max(position.line + 1, 1), doc.lines);
    const line = doc.line(lineNumber);
    const character = Math.max(0, Math.min(position.character, line.length));
    return line.from + character;
}

/** Only literal mapping keys have Compose schema documentation. */
export function composeKeyAt(state: EditorState, pos: number): { from: number; to: number } | null {
    if (pos < 0 || pos >= state.doc.length) {
        return null;
    }

    const node = syntaxTree(state).resolveInner(pos, 1);
    for (let current: typeof node | null = node; current; current = current.parent) {
        if (current.name === "Key" && current.parent?.name === "Pair") {
            const key = current.firstChild;
            if (!key || (key.name !== "Literal" && key.name !== "QuotedLiteral")) {
                return null;
            }
            return pos >= key.from && pos < key.to
                ? { from: key.from,
                    to: key.to }
                : null;
        }
        if (current.name === "Pair" || current.name === "Comment") {
            return null;
        }
    }
    return null;
}

function severityToCm(severity: Diagnostic["severity"]): CmDiagnostic["severity"] {
    // Schema "Property not allowed" etc. arrive as LSP Warning; show as error so
    // underlines stay obvious on the dark Dracula theme.
    switch (severity) {
        case 1:
        case 2:
            return "error";
        default:
            return "info";
    }
}

function markupToPlainText(value: string | MarkupContentType | undefined): string {
    if (!value) {
        return "";
    }
    if (typeof value === "string") {
        return value;
    }
    return value.value;
}

function hoverContentsToText(contents: Hover["contents"]): string {
    if (Array.isArray(contents)) {
        return contents
            .map((part) => markupToPlainText(part as string | MarkupContentType))
            .filter(Boolean)
            .join("\n\n");
    }
    if (contents && typeof contents === "object" && "language" in contents) {
        return (contents as { value: string }).value;
    }
    return markupToPlainText(contents as string | MarkupContentType);
}

export function normalizeComposeDocumentation(text: string): string {
    return text
        .replace(/^#{1,6}\s+Compose Specification\s*\n?/i, "")
        .replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g, "$1")
        .trim();
}

function createDocElement(text: string): HTMLElement {
    const el = document.createElement("div");
    el.className = "cm-compose-hover";

    const content = normalizeComposeDocumentation(text);

    for (const block of content.split(/\n\s*\n/)) {
        const row = document.createElement("p");
        row.className = "cm-compose-hover-text";
        const inlineCode = /`([^`]+)`/g;
        let cursor = 0;
        for (const match of block.matchAll(inlineCode)) {
            const index = match.index ?? 0;
            row.append(document.createTextNode(block.slice(cursor, index)));
            const code = document.createElement("code");
            code.textContent = match[1];
            row.append(code);
            cursor = index + match[0].length;
        }
        row.append(document.createTextNode(block.slice(cursor)));
        el.append(row);
    }
    return el;
}

function completionType(kind: CompletionItem["kind"]): string | undefined {
    switch (kind) {
        case 2:
        case 3:
            return "function";
        case 5:
        case 22:
            return "class";
        case 6:
        case 10:
            return "property";
        case 7:
        case 8:
            return "namespace";
        case 14:
            return "keyword";
        case 15:
            return "text";
        default:
            return "property";
    }
}

function completionItemToCm(item: CompletionItem, doc: Text): Completion {
    const documentation = markupToPlainText(
        item.documentation as string | MarkupContentType | undefined
    );
    const boost = composeCompletionBoost(item.sortText);
    const base: Completion = {
        label: item.label,
        detail: item.detail || undefined,
        info: documentation ? () => createDocElement(documentation) : undefined,
        type: completionType(item.kind),
        ...(boost !== undefined ? { boost } : {}),
    };

    const insertText = item.insertText ?? item.label;
    const isSnippet = item.insertTextFormat === InsertTextFormat.Snippet;

    if (item.textEdit && "range" in item.textEdit) {
        const from = positionToOffset(doc, item.textEdit.range.start);
        const to = positionToOffset(doc, item.textEdit.range.end);
        const text = item.textEdit.newText;
        if (isSnippet) {
            const applySnippet = snippet(text);
            return {
                ...base,
                apply(view, completion) {
                    applySnippet(view, completion, from, to);
                },
            };
        }
        return {
            ...base,
            apply(view) {
                view.dispatch(insertCompletionText(view.state, text, from, to));
            },
        };
    }

    if (isSnippet) {
        const applySnippet = snippet(insertText);
        return {
            ...base,
            apply(view, completion, from, to) {
                applySnippet(view, completion, from, to);
            },
        };
    }

    return {
        ...base,
        apply: insertText,
    };
}

/** Monotonic document version for discarding stale worker replies. */
const documentVersionField = StateField.define<number>({
    create() {
        return 1;
    },
    update(value, transaction) {
        return transaction.docChanged ? value + 1 : value;
    },
});

/**
 * Owns the worker client for the lifetime of the current editor configuration.
 * vue-codemirror6 reconfigures extensions when `disabled` flips; creating the
 * client inside the plugin ensures dispose/recreate stay paired.
 */
class ComposeLanguagePlugin {
    readonly client = new YamlLanguageClient();

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    update(_update: ViewUpdate): void {
        // no-op
    }

    destroy(): void {
        this.client.dispose();
    }
}

const composeLanguagePlugin = ViewPlugin.fromClass(ComposeLanguagePlugin);

function getClient(view: EditorView): YamlLanguageClient | null {
    return view.plugin(composeLanguagePlugin)?.client ?? null;
}

/**
 * Format the whole Compose document via the YAML language worker (Prettier).
 * Returns false when there is nothing to apply (already formatted, stale, or unavailable).
 */
export async function formatComposeYaml(view: EditorView): Promise<boolean> {
    const client = getClient(view);
    if (!client) {
        return false;
    }
    const text = view.state.doc.toString();
    const version = view.state.field(documentVersionField);
    try {
        const edits = await client.format(text, version);
        if (!edits.length || view.state.field(documentVersionField) !== version) {
            return false;
        }
        const changes = edits
            .map((edit) => ({
                from: positionToOffset(view.state.doc, edit.range.start),
                to: positionToOffset(view.state.doc, edit.range.end),
                insert: edit.newText,
            }))
            .sort((a, b) => b.from - a.from || b.to - a.to);
        view.dispatch({ changes });
        return true;
    } catch (error) {
        if (error instanceof StaleResponseError) {
            return false;
        }
        throw error;
    }
}

/**
 * CodeMirror extensions that provide Compose schema validation, completion, and hover.
 */
export function composeLanguageSupport(): Extension {
    const diagnose = linter(async (view) => {
        const client = getClient(view);
        if (!client) {
            return [];
        }
        const text = view.state.doc.toString();
        const version = view.state.field(documentVersionField);
        try {
            const diagnostics = await client.validate(text, version);
            if (view.state.field(documentVersionField) !== version) {
                return [];
            }
            return diagnostics.map((diagnostic): CmDiagnostic => ({
                from: positionToOffset(view.state.doc, diagnostic.range.start),
                to: positionToOffset(view.state.doc, diagnostic.range.end),
                severity: severityToCm(diagnostic.severity),
                message: markupToPlainText(diagnostic.message),
                source: typeof diagnostic.source === "string" ? diagnostic.source : "compose",
            }));
        } catch (error) {
            if (error instanceof StaleResponseError) {
                return [];
            }
            console.error(error);
            return [];
        }
    }, {
        delay: 300,
    });

    const complete = autocompletion({
        override: [
            async (context: CompletionContext): Promise<CompletionResult | null> => {
                if (!context.view) {
                    return null;
                }
                // Activate-on-typing, but ignore Space/Tab (YAML indent) —
                // only Ctrl+Space (explicit) opens completions after whitespace.
                if (!context.explicit) {
                    const typed = context.state.sliceDoc(Math.max(0, context.pos - 1), context.pos);
                    if (typed === " " || typed === "\t") {
                        return null;
                    }
                }
                const client = getClient(context.view);
                if (!client) {
                    return null;
                }
                const text = context.state.doc.toString();
                const version = context.state.field(documentVersionField);
                const position = offsetToPosition(context.state.doc, context.pos);

                try {
                    const result = await client.complete(text, version, position);
                    if (!result || result.items.length === 0 || context.aborted) {
                        return null;
                    }
                    if (context.state.field(documentVersionField) !== version) {
                        return null;
                    }

                    let from = context.pos;
                    let to = context.pos;
                    const firstEdit = result.items.find((item) => item.textEdit && "range" in item.textEdit);
                    if (firstEdit?.textEdit && "range" in firstEdit.textEdit) {
                        from = positionToOffset(context.state.doc, firstEdit.textEdit.range.start);
                        to = positionToOffset(context.state.doc, firstEdit.textEdit.range.end);
                    } else {
                        const word = context.matchBefore(/[\w-]+/);
                        if (word) {
                            from = word.from;
                            to = word.to;
                        }
                    }

                    return {
                        from,
                        to,
                        options: result.items.map((item) => completionItemToCm(item, context.state.doc)),
                    };
                } catch (error) {
                    if (error instanceof StaleResponseError || context.aborted) {
                        return null;
                    }
                    console.error(error);
                    return null;
                }
            },
        ],
        defaultKeymap: true,
        activateOnTyping: true,
        tooltipClass: () => "cm-compose-completions",
    });

    const hover = hoverTooltip(async (view, pos) => {
        const key = composeKeyAt(view.state, pos);
        const client = getClient(view);
        if (!key || !client) {
            return null;
        }
        const text = view.state.doc.toString();
        const version = view.state.field(documentVersionField);
        const position = offsetToPosition(view.state.doc, pos);

        try {
            const result = await client.hover(text, version, position);
            if (!result || view.state.field(documentVersionField) !== version) {
                return null;
            }
            const content = hoverContentsToText(result.contents).trim();
            if (!content) {
                return null;
            }

            return {
                pos: key.from,
                end: key.to,
                create() {
                    return {
                        dom: createDocElement(content),
                    };
                },
            };
        } catch (error) {
            if (!(error instanceof StaleResponseError)) {
                console.error(error);
            }
            return null;
        }
    }, {
        hideOnChange: true,
    });

    return [
        documentVersionField,
        composeLanguagePlugin,
        diagnose,
        complete,
        hover,
        keymap.of(completionKeymap),
        EditorView.baseTheme({
            ".cm-lintRange-error": {
                backgroundImage: "none",
                backgroundColor: "rgba(255, 85, 85, 0.15)",
                borderBottom: "2px wavy #ff5555",
            },
        }),
    ];
}
