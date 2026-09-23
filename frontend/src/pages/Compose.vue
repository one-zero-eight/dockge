<template>
    <transition name="slide-fade" appear>
        <div
            class="compose-page"
            :class="{ 'stack-view-mode': !isAdd && !isEditMode && stack.isManagedByDockge, 'full-page-editor': isFullPageEditor }"
        >
            <div class="project-header mb-3">
                <h1 v-if="isAdd" class="mb-0">{{ $t("compose") }}</h1>
                <h1 v-else class="project-title mb-0">
                    <FloatingTooltip placement="top-start">
                        <template #trigger="{ triggerAttrs }">
                            <span
                                v-bind="triggerAttrs"
                                class="project-status-dot"
                                :class="`bg-${statusColor(globalStack?.status)}`"
                                role="img"
                                :aria-label="$t(projectStatus.title)"
                            />
                        </template>
                        <span class="floating-tooltip-title">{{ $t(projectStatus.title) }}</span>
                        <span class="floating-tooltip-detail">{{ projectStatus.detail }}</span>
                    </FloatingTooltip> <span>{{ stack.name }}</span>
                    <span class="stack-label opacity-50 user-select-none">{{ $t("project") }}</span>
                    <span v-if="$root.agentCount > 1 && endpoint !== ''" class="agent-name">
                        ({{ endpointDisplay }})
                    </span>
                </h1>

                <ActionGroup
                    v-if="stack.isManagedByDockge && !isFullPageEditor"
                    class="stack-actions"
                    :actions="projectActions"
                    :disabled="processing"
                    :max-visible="3"
                    :aria-label="$t('projectActions')"
                    @select="requestProjectAction"
                />
            </div>

            <!-- URLs -->
            <div v-if="urls.length > 0" class="mb-3">
                <a v-for="(urlItem, index) in urls" :key="index" target="_blank" :href="urlItem.url">
                    <span class="badge bg-secondary me-2">{{ urlItem.display }}</span>
                </a>
            </div>

            <div v-if="$root.isCompact && stack.isManagedByDockge && !isFullPageEditor" class="compact-compose-tabs mb-3" role="tablist">
                <button class="compact-tab" :class="{ active: compactTab === 'containers' }" type="button" role="tab" :aria-selected="compactTab === 'containers'" @click="compactTab = 'containers'">{{ $t("services") }}</button>
                <button class="compact-tab" :class="{ active: compactTab === 'compose' }" type="button" role="tab" :aria-selected="compactTab === 'compose'" @click="compactTab = 'compose'">Compose</button>
            </div>

            <!-- New project general fields -->
            <div v-if="isAdd" class="shadow-box big-padding mb-3">
                <label for="name" class="form-label">{{ $t("stackFolder") }}</label>
                <div class="stack-folder-picker">
                    <FloatingMenu
                        placement="bottom-start"
                        :offset="4"
                        :match-trigger-width="true"
                        panel-class="stack-path-menu"
                    >
                        <template #trigger="{ triggerAttrs, isOpen }">
                            <button
                                v-bind="triggerAttrs"
                                id="endpoint"
                                type="button"
                                class="stack-path-full"
                                :class="{ open: isOpen }"
                                :title="stacksDirectoryPath"
                                :aria-label="$t('dockgeAgent')"
                            >
                                <span class="stack-path-text">
                                    <span class="stack-path-dir">{{ stacksDirectoryPath.replace(/\/+$/, "") }}/</span><span class="stack-path-name" :class="{ 'is-placeholder': !stack.name }">{{ stack.name || $t("stackFolderPlaceholder") }}</span>
                                </span>
                                <font-awesome-icon icon="chevron-down" class="stack-path-caret" />
                            </button>
                        </template>

                        <button
                            v-for="opt in agentPathOptions"
                            :key="opt.endpoint === '' ? 'current' : opt.endpoint"
                            type="button"
                            role="menuitem"
                            class="floating-menu-item stack-path-option"
                            :class="{ active: (stack.endpoint || '') === (opt.endpoint || '') }"
                            :disabled="opt.offline"
                            @click="selectAgentPath(opt.endpoint)"
                        >
                            <span class="stack-path-option-line">
                                <span class="stack-path-option-dir">{{ opt.path }}/</span><span class="stack-path-option-name" :class="{ 'is-placeholder': !stack.name }">{{ stack.name || $t("stackFolderPlaceholder") }}</span>
                            </span>
                            <span v-if="opt.agentLabel" class="stack-path-option-agent">{{ opt.agentLabel }}</span>
                        </button>
                    </FloatingMenu>
                    <input
                        id="name"
                        v-model="stack.name"
                        type="text"
                        class="form-control"
                        required
                        spellcheck="false"
                        autocomplete="off"
                        :placeholder="$t('stackFolderPlaceholder')"
                        @input="normalizeStackFolderName"
                        @blur="finalizeStackFolderName"
                    >
                </div>
                <div class="form-text">{{ $t("stackFolderHint") }}</div>
            </div>

            <div v-if="stack.isManagedByDockge" class="row stack-content">
                <div v-if="!isFullPageEditor" v-show="!$root.isCompact || compactTab === 'containers'" class="col-lg-6 containers-column">
                    <div ref="containerList" class="container-list">
                        <Container
                            v-for="name in displayServiceNames"
                            :key="name"
                            :name="name"
                            :serviceStatus="serviceStatusList[name]"
                            :dockerStats="dockerStats"
                            :service-count="displayServiceNames.length"
                            @start-service="startService"
                            @stop-service="stopService"
                            @restart-service="restartService"
                        />
                    </div>
                </div>
                <div v-show="isFullPageEditor || !$root.isCompact || compactTab !== 'containers'" class="compose-column" :class="isFullPageEditor ? 'col-12' : 'col-lg-6'">
                    <!-- YAML editor -->
                    <div v-show="isFullPageEditor || !$root.isCompact || compactTab === 'compose'" class="shadow-box mb-3 editor-box" :class="{'edit-mode' : isEditMode}">
                        <div class="editor-toolbar">
                            <span class="editor-filename">{{ stack.composeFileName || "compose.yaml" }}</span>
                            <button
                                v-if="!isFullPageEditor && stack.isManagedByDockge"
                                type="button"
                                class="editor-edit"
                                :disabled="processing"
                                @click="enableEditMode"
                            >
                                <font-awesome-icon icon="pen" />
                                {{ $t("editStack") }}
                            </button>
                        </div>

                        <code-mirror
                            ref="editor"
                            v-model="stack.composeYAML"
                            :extensions="extensions"
                            minimal
                            wrap="true"
                            dark="true"
                            tab="true"
                            :disabled="!isEditMode"
                            :hasFocus="editorFocus"
                            @change="yamlCodeChange"
                        />

                        <!-- Editor actions -->
                        <div v-if="isFullPageEditor" class="editor-actions">
                            <button class="btn btn-primary" :disabled="processing || !canSaveStack" @click="deployStack">
                                <font-awesome-icon icon="rocket" class="me-1" />
                                {{ $t("deployStack") }}
                            </button>
                            <button class="btn btn-normal" :disabled="processing || !canSaveStack" @click="saveStack">
                                <font-awesome-icon icon="save" class="me-1" />
                                {{ $t("saveStackDraft") }}
                            </button>
                            <button v-if="!isAdd" class="btn btn-normal" :disabled="processing" @click="discardStack">
                                {{ $t("discardStack") }}
                            </button>
                        </div>
                    </div>
                    <div v-if="isEditMode && yamlError" v-show="isFullPageEditor || !$root.isCompact || compactTab === 'compose'" class="mb-3">
                        {{ yamlError }}
                    </div>
                </div>
            </div>

            <div v-if="!stack.isManagedByDockge && !processing">
                {{ $t("stackNotManagedByDockgeMsg") }}
            </div>

            <FloatingDialog
                v-model="showActionDialog"
                size="sm"
                :title="$t(actionConfirm.title)"
                :ok-title="$t(actionConfirm.ok)"
                :cancel-title="$t('cancel')"
                :ok-variant="actionConfirm.variant"
                :busy="processing"
                @ok="confirmProjectAction"
                @hidden="clearPendingAction"
            >
                <p class="mb-2">{{ $t(actionConfirm.message, { name: stack.name }) }}</p>
                <div v-if="actionConfirm.commands?.length" class="action-commands">
                    <pre><code v-for="(cmd, i) in actionConfirm.commands" :key="i"><span class="action-command-prompt">$</span> {{ cmd }}</code></pre>
                </div>
            </FloatingDialog>

            <FloatingDialog
                v-model="showProgressDialog"
                size="lg"
                dialog-class="progress-terminal-dialog"
                :title="progressDialogTitle"
                :hide-footer="true"
                @shown="onProgressDialogShown"
                @hidden="onProgressDialogHidden"
            >
                <template #header>
                    <div class="progress-header-bar">
                        <div class="progress-dialog-title">{{ progressDialogTitle }}</div>
                        <div class="progress-header-tools">
                            <button
                                type="button"
                                class="btn btn-sm btn-normal"
                                @click="$refs.progressTerminal?.focus()"
                            >
                                <font-awesome-icon icon="terminal" />
                                {{ $t("focusTerminal") }}
                            </button>
                            <button
                                type="button"
                                class="btn btn-sm btn-normal"
                                :disabled="!progressTerminalHasSelection"
                                @click="$refs.progressTerminal?.copySelection()"
                            >
                                <font-awesome-icon icon="copy" />
                                {{ $t("copySelection") }}
                            </button>
                            <button
                                type="button"
                                class="btn btn-sm btn-normal"
                                @click="$refs.progressTerminal?.clear()"
                            >
                                <font-awesome-icon icon="trash" />
                                {{ $t("clearDisplay") }}
                            </button>
                        </div>
                    </div>
                </template>
                <Terminal
                    ref="progressTerminal"
                    class="progress-terminal"
                    :name="terminalName"
                    :endpoint="endpoint"
                    :rows="progressTerminalRows"
                    :cols="progressTerminalCols"
                    :show-toolbar="false"
                    :auto-fit="false"
                    @has-data="onProgressTerminalData"
                    @selection-change="progressTerminalHasSelection = $event"
                />
            </FloatingDialog>
        </div>
    </transition>
</template>

<script>
import CodeMirror from "vue-codemirror6";
import { yaml } from "@codemirror/lang-yaml";
import { dracula as editorTheme } from "thememirror";
import { lineNumbers, EditorView } from "@codemirror/view";
import { parseDocument } from "yaml";

import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { composeLanguageSupport } from "../editor/compose-language";
import {
    envsubstYAML,
    getComposeTerminalName,
    PROGRESS_TERMINAL_ROWS,
    statusColor,
    stackStatusDetail,
    stackStatusTitle,
    TERMINAL_COLS,
    RUNNING
} from "../../../common/util-common";
import { FloatingDialog, FloatingMenu, FloatingTooltip } from "../components/floating";
import ActionGroup from "../components/ActionGroup.vue";
import dotenv from "dotenv";
import { ref } from "vue";

const template = `
services:
  nginx:
    image: nginx:latest
    restart: unless-stopped
    ports:
      - "8080:80"
`;
const envDefault = "# VARIABLE=value #comment";

/**
 * Copy shown in the confirmation dialog of each project action.
 * `ok` uses the action label, `message` is the sentence rendered inside the dialog,
 * `commands` are the docker / compose invocations that will run.
 */
const PROJECT_ACTIONS = {
    startStack: {
        title: "startProjectConfirmTitle",
        message: "startProjectConfirmMsg",
        ok: "startStack",
        variant: "btn-primary",
        commands: [ "docker compose up -d --remove-orphans" ],
    },
    restartStack: {
        title: "restartProjectConfirmTitle",
        message: "restartProjectConfirmMsg",
        ok: "restartStack",
        variant: "btn-primary",
        commands: [ "docker compose restart" ],
    },
    updateStack: {
        title: "updateProjectConfirmTitle",
        message: "updateProjectConfirmMsg",
        ok: "updateStack",
        variant: "btn-primary",
        commands: [
            "docker compose pull",
            "docker compose up -d --remove-orphans",
        ],
    },
    stopStack: {
        title: "stopProjectConfirmTitle",
        message: "stopProjectConfirmMsg",
        ok: "stopStack",
        variant: "btn-warning",
        commands: [ "docker compose stop" ],
    },
    downStack: {
        title: "downProjectConfirmTitle",
        message: "downProjectConfirmMsg",
        ok: "downStack",
        variant: "btn-warning",
        commands: [ "docker compose down" ],
    },
    deleteStack: {
        title: "deleteProjectConfirmTitle",
        message: "deleteProjectConfirmMsg",
        ok: "deleteStack",
        variant: "btn-danger",
        commands: [ "docker compose down --remove-orphans" ],
    },
};

let yamlErrorTimeout = null;

let serviceStatusTimeout = null;
let dockerStatsTimeout = null;
let progressCloseTimer = null;

export default {
    components: {
        FontAwesomeIcon,
        CodeMirror,
        FloatingDialog,
        FloatingMenu,
        FloatingTooltip,
        ActionGroup,
    },
    beforeRouteUpdate(to, from, next) {
        this.exitConfirm(next);
    },
    beforeRouteLeave(to, from, next) {
        this.exitConfirm(next);
    },
    setup() {
        const editorFocus = ref(false);

        const focusEffectHandler = (state, focusing) => {
            editorFocus.value = focusing;
            return null;
        };

        const extensions = [
            editorTheme,
            yaml(),
            composeLanguageSupport(),
            lineNumbers(),
            EditorView.focusChangeEffect.of(focusEffectHandler)
        ];

        return { extensions,
            editorFocus };
    },
    data() {
        return {
            jsonConfig: {},
            envsubstJSONConfig: {},
            yamlError: "",
            processing: true,
            stack: {

            },
            serviceStatusList: {},
            dockerStats: {},
            isEditMode: false,
            submitted: false,
            showActionDialog: false,
            pendingAction: null,
            showProgressDialog: false,
            progressAction: null,
            progressCommands: [],
            progressTerminalHasSelection: false,
            progressResult: null,
            progressCloseIn: 0,
            pendingProgressRun: null,
            progressTerminalRows: PROGRESS_TERMINAL_ROWS,
            progressTerminalCols: TERMINAL_COLS,
            compactTab: "containers",
            stopServiceStatusTimeout: false,
            stopDockerStatsTimeout: false,
        };
    },
    computed: {
        endpointDisplay() {
            return this.$root.endpointDisplayFunction(this.endpoint);
        },

        /**
         * Row actions of the project. The first ones are rendered as buttons (as many
         * as fit), `menuOnly` ones are always kept inside the overflow menu.
         * @returns {object[]}
         */
        projectActions() {
            const actions = [];

            if (this.active) {
                actions.push({ key: "restartStack",
                    i18nKey: "restartStack",
                    icon: "rotate",
                    variant: "btn-normal" });
                actions.push({ key: "updateStack",
                    i18nKey: "updateStack",
                    icon: "cloud-arrow-down",
                    variant: "btn-normal" });
                actions.push({ key: "stopStack",
                    i18nKey: "stopStack",
                    icon: "stop",
                    variant: "btn-warning" });
            } else {
                actions.push({ key: "startStack",
                    i18nKey: "startStack",
                    icon: "play",
                    variant: "btn-primary" });
            }

            if (!this.active) {
                actions.push({ key: "updateStack",
                    i18nKey: "updateStack",
                    icon: "cloud-arrow-down",
                    variant: "btn-normal",
                    menuOnly: true });
            }
            actions.push({ key: "downStack",
                i18nKey: "downStack",
                icon: "stop",
                variant: "btn-warning",
                menuOnly: true });
            actions.push({ key: "deleteStack",
                i18nKey: "deleteStack",
                icon: "trash",
                variant: "btn-danger",
                menuOnly: true });

            return actions;
        },

        /**
         * Copy for the confirmation dialog of the pending project action.
         * @returns {{ title: string, message: string, ok: string, variant: string, commands: string[] }}
         */
        actionConfirm() {
            return PROJECT_ACTIONS[this.pendingAction] ?? PROJECT_ACTIONS.startStack;
        },

        /**
         * Title for the progress terminal dialog.
         * @returns {string}
         */
        progressDialogTitle() {
            if (this.progressAction) {
                return this.$t(this.progressAction);
            }
            return this.$t("terminal");
        },

        urls() {
            if (!this.envsubstJSONConfig["x-dockge"] || !this.envsubstJSONConfig["x-dockge"].urls || !Array.isArray(this.envsubstJSONConfig["x-dockge"].urls)) {
                return [];
            }

            let urls = [];
            for (const url of this.envsubstJSONConfig["x-dockge"].urls) {
                let display;
                try {
                    let obj = new URL(url);
                    let pathname = obj.pathname;
                    if (pathname === "/") {
                        pathname = "";
                    }
                    display = obj.host + pathname + obj.search;
                } catch (e) {
                    display = url;
                }

                urls.push({
                    display,
                    url,
                });
            }
            return urls;
        },

        isAdd() {
            return this.$route.path === "/compose" && !this.submitted;
        },

        isFullPageEditor() {
            return this.isAdd || this.isEditMode;
        },

        stacksDirectoryPath() {
            const key = this.stack.endpoint || "current";
            return this.$root.stacksDirectoryPaths[key]
                || this.$root.stacksDirectoryPaths.current
                || "stacks";
        },

        agentPathOptions() {
            const options = [];
            const agents = Object.entries(this.$root.agentList || {});

            if (agents.length === 0) {
                const dir = (this.$root.stacksDirectoryPaths.current || "stacks").replace(/\/+$/, "");
                options.push({
                    endpoint: "",
                    path: dir,
                    agentLabel: this.$t("Current"),
                    offline: false,
                });
                return options;
            }

            for (const [ endpoint, agent ] of agents) {
                const pathKey = endpoint || "current";
                const dir = (this.$root.stacksDirectoryPaths[pathKey]
                    || this.$root.stacksDirectoryPaths.current
                    || "stacks").replace(/\/+$/, "");
                const agentLabel = (agent.name !== "" ? agent.name : null) || agent.url || this.$t("Current");
                const status = this.$root.agentStatusList[endpoint];
                options.push({
                    endpoint,
                    path: dir,
                    agentLabel,
                    offline: status != null && status !== "online",
                });
            }
            return options;
        },

        canSaveStack() {
            if (!this.isAdd) {
                return true;
            }
            return /^[a-z0-9_-]+$/.test(this.stack.name || "");
        },

        /**
         * Get the stack from the global stack list, because it may contain more real-time data like status
         * @return {*}
         */
        globalStack() {
            return this.$root.completeStackList[this.stack.name + "_" + this.endpoint];
        },

        /**
         * Status tooltip of the project title: a sentence plus the raw compose status.
         * @returns {object}
         */
        projectStatus() {
            const stack = this.globalStack || this.stack;
            const detail = stackStatusDetail(stack);
            return {
                title: stackStatusTitle(stack),
                detail: this.$te(detail) ? this.$t(detail) : detail,
            };
        },

        status() {
            return this.globalStack?.status;
        },

        active() {
            return this.status === RUNNING;
        },

        displayServiceNames() {
            const configuredServices = Object.keys(this.jsonConfig.services || {});
            return Array.from(new Set([
                ...configuredServices,
                ...Object.keys(this.serviceStatusList || {})
            ])).sort((a, b) => a.localeCompare(b));
        },

        terminalName() {
            if (!this.stack.name) {
                return "";
            }
            return getComposeTerminalName(this.endpoint, this.stack.name);
        },

        networks() {
            return this.jsonConfig.networks;
        },

        endpoint() {
            return this.stack.endpoint || this.$route.params.endpoint || "";
        },

        url() {
            if (this.stack.endpoint) {
                return `/compose/${this.stack.name}/${this.stack.endpoint}`;
            } else {
                return `/compose/${this.stack.name}`;
            }
        },

    },
    watch: {
        "stack.composeYAML": {
            handler() {
                if (this.editorFocus) {
                    console.debug("yaml code changed");
                    this.yamlCodeChange();
                }
            },
            deep: true,
        },

        "stack.composeENV": {
            handler() {
                if (this.editorFocus) {
                    console.debug("env code changed");
                    this.yamlCodeChange();
                }
            },
            deep: true,
        },

        $route(to, from) {

        }
    },
    mounted() {
        if (this.isAdd) {
            this.processing = false;
            this.isEditMode = true;

            let composeYAML = template;
            let composeENV;

            if (this.$root.envTemplate) {
                composeENV = this.$root.envTemplate;
                this.$root.envTemplate = "";
            } else {
                composeENV = envDefault;
            }

            // Default Values
            this.stack = {
                name: "",
                composeYAML,
                composeENV,
                composeFileName: "compose.yaml",
                isManagedByDockge: true,
                endpoint: "",
            };

            this.yamlCodeChange();

        } else {
            this.stack.name = this.$route.params.stackName;
            this.loadStack();
        }

        this.requestServiceStatus();
        this.requestDockerStats();
    },
    methods: {
        statusColor,

        startServiceStatusTimeout() {
            clearTimeout(serviceStatusTimeout);
            serviceStatusTimeout = setTimeout(async () => {
                this.requestServiceStatus();
            }, 5000);
        },

        startDockerStatsTimeout() {
            clearTimeout(dockerStatsTimeout);
            dockerStatsTimeout = setTimeout(async () => {
                this.requestDockerStats();
            }, 5000);
        },

        requestServiceStatus() {
            // Do not request if it is add mode
            if (this.isAdd) {
                return;
            }

            this.$root.emitAgent(this.endpoint, "serviceStatusList", this.stack.name, (res) => {
                if (res.ok) {
                    this.serviceStatusList = res.serviceStatusList;
                }
                if (!this.stopServiceStatusTimeout) {
                    this.startServiceStatusTimeout();
                }
            });
        },

        requestDockerStats() {
            this.$root.emitAgent(this.endpoint, "dockerStats", (res) => {
                if (res.ok) {
                    this.dockerStats = res.dockerStats;
                }
                if (!this.stopDockerStatsTimeout) {
                    this.startDockerStatsTimeout();
                }
            });
        },

        exitConfirm(next) {
            if (this.isEditMode) {
                if (confirm(this.$t("confirmLeaveStack"))) {
                    this.exitAction();
                    next();
                } else {
                    next(false);
                }
            } else {
                this.exitAction();
                next();
            }
        },

        exitAction() {
            console.log("exitAction");
            this.stopServiceStatusTimeout = true;
            this.stopDockerStatsTimeout = true;
            clearTimeout(serviceStatusTimeout);
            clearTimeout(dockerStatsTimeout);
            this.clearProgressCloseTimer();
        },

        bindTerminal(callback) {
            // Skip replaying the server buffer: stale progress frames with a mismatched
            // PTY size turn into dozens of wrapped lines. Keep a clean screen and stream
            // live output with cols locked to TERMINAL_COLS (matches backend PTY).
            this.$refs.progressTerminal?.bind(this.endpoint, this.terminalName, () => {
                this.$refs.progressTerminal?.reset();
                this.writeProgressCommands();
                callback?.();
            }, { skipBuffer: true });
        },

        /**
         * Echo the compose/docker commands into the progress terminal before output streams.
         * @returns {void}
         */
        writeProgressCommands() {
            if (!this.progressCommands?.length) {
                return;
            }
            const lines = this.progressCommands
                .map((cmd) => `\x1b[38;2;126;231;135m$ ${cmd}\x1b[0m`)
                .join("\r\n");
            this.$refs.progressTerminal?.write(`${lines}\r\n\r\n`);
        },

        /**
         * Open the progress terminal dialog, bind it, then run the action so
         * compose output is streamed into the modal instead of the page.
         * @param {string} actionKey i18n key used as the dialog title
         * @param {() => void} run Action that emits the agent request
         * @param {string[]} [commands] Commands echoed into the terminal
         * @returns {void}
         */
        runWithProgress(actionKey, run, commands) {
            this.clearProgressCloseTimer();
            this.processing = true;
            this.progressAction = actionKey;
            this.progressCommands = commands ?? PROJECT_ACTIONS[actionKey]?.commands ?? [];
            this.progressResult = null;
            this.progressCloseIn = 0;
            this.submitted = true;

            if (this.showProgressDialog) {
                this.bindTerminal(run);
                return;
            }

            this.pendingProgressRun = run;
            this.showProgressDialog = true;
        },

        onProgressDialogShown() {
            this.bindTerminal(() => {
                const run = this.pendingProgressRun;
                this.pendingProgressRun = null;
                run?.();
            });
        },

        onProgressTerminalData() {
            this.submitted = true;
        },

        onProgressDialogHidden() {
            this.clearProgressCloseTimer();
            this.progressResult = null;
            this.progressCloseIn = 0;
            this.progressTerminalHasSelection = false;
        },

        /**
         * Mark the progress dialog finished and auto-close on success.
         * Toast only if the user already dismissed the modal.
         * @param {{ ok?: boolean }} res Agent response
         * @returns {void}
         */
        finishProgress(res) {
            const dismissed = !this.showProgressDialog;
            this.processing = false;
            this.progressResult = res?.ok ? "ok" : "error";
            this.clearProgressCloseTimer();

            if (dismissed) {
                this.$root.toastRes(res);
                return;
            }

            if (!res?.ok) {
                return;
            }

            this.progressCloseIn = 3;
            this.writeProgressClosing(this.progressCloseIn);
            progressCloseTimer = setInterval(() => {
                this.progressCloseIn -= 1;
                if (this.progressCloseIn <= 0) {
                    this.clearProgressCloseTimer();
                    this.showProgressDialog = false;
                    return;
                }
                this.writeProgressClosing(this.progressCloseIn);
            }, 1000);
        },

        /**
         * Echo the auto-close countdown into the progress terminal.
         * @param {number} n Seconds remaining
         * @returns {void}
         */
        writeProgressClosing(n) {
            const msg = this.$t("progressClosingIn", { n });
            const colored = `\x1b[38;2;134;230;169m${msg}\x1b[0m`;
            if (n === 3) {
                this.$refs.progressTerminal?.write(`\r\n${colored}`);
            } else {
                this.$refs.progressTerminal?.write(`\r\x1b[2K${colored}`);
            }
        },

        clearProgressCloseTimer() {
            if (progressCloseTimer) {
                clearInterval(progressCloseTimer);
                progressCloseTimer = null;
            }
        },

        loadStack() {
            this.processing = true;
            this.$root.emitAgent(this.endpoint, "getStack", this.stack.name, (res) => {
                if (res.ok) {
                    this.stack = res.stack;
                    this.yamlCodeChange();
                    this.processing = false;
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        deployStack() {
            if (!this.canSaveStack) {
                return;
            }

            if (!this.jsonConfig.services) {
                this.$root.toastError("No services found in compose.yaml");
                return;
            }

            // Check if services is object
            if (typeof this.jsonConfig.services !== "object") {
                this.$root.toastError("Services must be an object");
                return;
            }

            let serviceNameList = Object.keys(this.jsonConfig.services);

            // Set the stack name if empty, use the first container name
            if (!this.stack.name && serviceNameList.length > 0) {
                let serviceName = serviceNameList[0];
                let service = this.jsonConfig.services[serviceName];

                if (service && service.container_name) {
                    this.stack.name = service.container_name;
                } else {
                    this.stack.name = serviceName;
                }
            }

            this.runWithProgress("deployStack", () => {
                this.$root.emitAgent(this.stack.endpoint, "deployStack", this.stack.name, this.composeEditorContent(), this.stack.composeENV, this.isAdd, (res) => {
                    this.finishProgress(res);

                    if (res.ok) {
                        this.stack.name = res.name;
                        this.isEditMode = false;
                        this.clearProgressCloseTimer();
                        this.showProgressDialog = false;
                        this.$router.push(this.url);
                    }
                });
            }, [ "docker compose up -d --remove-orphans" ]);
        },

        /** Return the editor document verbatim, including comments and trailing newline. */
        composeEditorContent() {
            return this.$refs.editor?.view?.state.doc.toString() ?? this.stack.composeYAML;
        },

        saveStack() {
            if (!this.canSaveStack) {
                return;
            }

            this.processing = true;

            this.$root.emitAgent(this.stack.endpoint, "saveStack", this.stack.name, this.composeEditorContent(), this.stack.composeENV, this.isAdd, (res) => {
                this.processing = false;
                this.$root.toastRes(res);

                if (res.ok) {
                    this.stack.name = res.name;
                    this.isEditMode = false;
                    this.$router.push(this.url);
                }
            });
        },

        requestProjectAction(action) {
            if (this.processing) {
                return;
            }
            this.pendingAction = action;
            this.showActionDialog = true;
        },

        confirmProjectAction() {
            if (this.processing || !this.pendingAction) {
                return;
            }
            const action = this.pendingAction;
            this.showActionDialog = false;
            this[action]();
        },

        /**
         * Drop the pending action once the dialog has finished its leave transition,
         * so the copy does not change while it is animating out.
         * @returns {void}
         */
        clearPendingAction() {
            this.pendingAction = null;
        },

        startStack() {
            this.runWithProgress("startStack", () => {
                this.$root.emitAgent(this.endpoint, "startStack", this.stack.name, (res) => {
                    this.finishProgress(res);
                });
            });
        },

        stopStack() {
            this.runWithProgress("stopStack", () => {
                this.$root.emitAgent(this.endpoint, "stopStack", this.stack.name, (res) => {
                    this.finishProgress(res);
                });
            });
        },

        downStack() {
            this.runWithProgress("downStack", () => {
                this.$root.emitAgent(this.endpoint, "downStack", this.stack.name, (res) => {
                    this.finishProgress(res);
                });
            });
        },

        restartStack() {
            this.runWithProgress("restartStack", () => {
                this.$root.emitAgent(this.endpoint, "restartStack", this.stack.name, (res) => {
                    this.finishProgress(res);
                });
            });
        },

        updateStack() {
            this.runWithProgress("updateStack", () => {
                this.$root.emitAgent(this.endpoint, "updateStack", this.stack.name, (res) => {
                    this.finishProgress(res);
                });
            });
        },

        deleteStack() {
            this.runWithProgress("deleteStack", () => {
                this.$root.emitAgent(this.endpoint, "deleteStack", this.stack.name, (res) => {
                    this.finishProgress(res);
                    if (res.ok) {
                        this.clearProgressCloseTimer();
                        this.showProgressDialog = false;
                        this.$router.push("/");
                    }
                });
            });
        },

        discardStack() {
            this.loadStack();
            this.isEditMode = false;
        },

        yamlToJSON(yamlText) {
            const doc = parseDocument(yamlText);
            if (doc.errors.length > 0) {
                throw doc.errors[0];
            }

            const config = doc.toJS() ?? {};
            if (config.services != null && (Array.isArray(config.services) || typeof config.services !== "object")) {
                throw new Error("Services must be an object");
            }

            return config;
        },

        yamlCodeChange() {
            try {
                // Parsed data drives previews only; never serialize it into the editor.
                this.jsonConfig = this.yamlToJSON(this.stack.composeYAML);

                const env = dotenv.parse(this.stack.composeENV);
                this.envsubstJSONConfig = envsubstYAML(this.stack.composeYAML, env);

                clearTimeout(yamlErrorTimeout);
                this.yamlError = "";
            } catch (e) {
                clearTimeout(yamlErrorTimeout);

                if (this.yamlError) {
                    this.yamlError = e.message;

                } else {
                    yamlErrorTimeout = setTimeout(() => {
                        this.yamlError = e.message;
                    }, 3000);
                }
            }
        },

        enableEditMode() {
            this.isEditMode = true;
        },

        checkYAML() {

        },

        normalizeStackFolderName() {
            // Keep trailing "-" while typing (e.g. "my-…"); strip only illegal chars.
            this.stack.name = (this.stack.name || "")
                .toLowerCase()
                .replace(/[^a-z0-9_-]/g, "");
        },

        finalizeStackFolderName() {
            this.normalizeStackFolderName();
            this.stack.name = (this.stack.name || "").replace(/^-+|-+$/g, "");
        },

        selectAgentPath(endpoint) {
            this.stack.endpoint = endpoint;
        },

        startService(serviceName) {
            this.runWithProgress("startStack", () => {
                this.$root.emitAgent(this.endpoint, "startService", this.stack.name, serviceName, (res) => {
                    this.finishProgress(res);

                    if (res.ok) {
                        this.requestServiceStatus();
                    }
                });
            }, [ `docker compose up -d ${serviceName}` ]);
        },

        stopService(serviceName) {
            this.runWithProgress("stopStack", () => {
                this.$root.emitAgent(this.endpoint, "stopService", this.stack.name, serviceName, (res) => {
                    this.finishProgress(res);

                    if (res.ok) {
                        this.requestServiceStatus();
                    }
                });
            }, [ `docker compose stop ${serviceName}` ]);
        },

        restartService(serviceName) {
            this.runWithProgress("restartStack", () => {
                this.$root.emitAgent(this.endpoint, "restartService", this.stack.name, serviceName, (res) => {
                    this.finishProgress(res);

                    if (res.ok) {
                        this.requestServiceStatus();
                    }
                });
            }, [ `docker compose restart ${serviceName}` ]);
        },
    }
};
</script>

<style scoped lang="scss">
@import "../styles/vars.scss";

.progress-terminal {
    height: 144px;
}

.stack-folder-picker {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    .stack-path-full {
        display: flex;
        width: 100%;
        align-items: center;
        gap: 0.5rem;
        padding: 0.45rem 0.7rem;
        border: 1px solid var(--bs-border-color);
        border-radius: var(--bs-border-radius);
        background-color: rgba(127, 127, 127, 0.08);
        color: $dark-font-color3;
        font-family: "JetBrains Mono", ui-monospace, monospace;
        font-size: 0.8rem;
        line-height: 1.45;
        text-align: start;
        cursor: pointer;
        box-shadow: none;

        &:hover,
        &:focus-visible,
        &.open {
            border-color: $primary;
            outline: none;
        }
    }

    .stack-path-dir {
        color: $dark-font-color3;
    }

    .stack-path-text {
        flex: 1 1 auto;
        min-width: 0;
        overflow-wrap: anywhere;
        word-break: break-all;
        text-align: start;
    }

    .stack-path-name {
        color: #fff;

        &.is-placeholder {
            opacity: 0.45;
        }
    }

    .stack-path-caret {
        flex: 0 0 auto;
        font-size: 0.7rem;
        opacity: 0.75;
    }

    .form-control {
        font-family: "JetBrains Mono", ui-monospace, monospace;
    }
}

.dark .stack-folder-picker {
    .stack-path-full {
        border-color: $dark-border-color;
        background-color: rgba(0, 0, 0, 0.25);
        color: $dark-font-color3;
    }
}

.editor-box {
    display: flex;
    overflow: hidden;
    flex-direction: column;
    padding: 0;
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;

    :deep(.vue-codemirror) {
        overflow: hidden;
        flex: 1 1 auto;
        min-height: 0;
    }

    :deep(.cm-editor) {
        height: 100%;
        min-height: 0;
    }

    :deep(.cm-scroller) {
        overflow: auto;
        scrollbar-gutter: stable;
    }

    :deep(.cm-content) {
        padding-right: 1rem;
    }

    :deep(.cm-gutters) {
        padding-left: 0.4rem;
    }
}

.editor-toolbar {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin: 0;
    padding: 0.55rem 0.75rem;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);

    .dark & {
        border-bottom-color: $dark-border-color;
    }
}

.editor-filename {
    overflow: hidden;
    min-width: 0;
    margin-right: auto;
    font-family: inherit;
    font-size: 0.85rem;
    font-weight: 500;
    letter-spacing: 0.01em;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.85;
}

.editor-edit {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-height: 28px;
    padding: 0.2rem 0.65rem;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font-family: inherit;
    font-size: 0.8rem;
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
    opacity: 0.75;
    transition: background-color 0.15s ease, opacity 0.15s ease;

    svg {
        display: block;
        width: 0.85em;
        height: 0.85em;
        flex: 0 0 auto;
    }

    &:hover:not(:disabled) {
        background: rgba(0, 0, 0, 0.06);
        opacity: 1;
    }

    &:focus-visible {
        outline: 2px solid $primary;
        outline-offset: 1px;
        opacity: 1;
    }

    &:disabled {
        cursor: not-allowed;
        opacity: 0.4;
    }

    .dark & {
        &:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.08);
        }
    }
}

.editor-actions {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0;
    padding: 0.6rem 0.75rem;
    border-top: 1px solid rgba(0, 0, 0, 0.12);

    .dark & {
        border-top-color: $dark-border-color;
    }

    .btn {
        white-space: nowrap;
    }
}

.stack-label {
    margin-inline-start: 0.35rem;
    font-size: 1.25rem;
    font-weight: normal;
}

.agent-name {
    font-size: 13px;
    color: $dark-font-color3;
}

.compact-compose-tabs {
    display: flex;
    overflow: hidden;
    padding: 3px;
    border-radius: 8px;
    background: #F5F5F5;

    .dark & {
        background: $dark-header-bg;
    }
}

.compact-tab {
    flex: 1 1 0;
    padding: 0.35rem 0.75rem;
    border: 0;
    border-radius: 6px;
    font-size: 0.9rem;
    color: inherit;
    background: transparent;
    transition: background 0.15s ease, color 0.15s ease;

    &:hover {
        background: rgba($primary, 0.15);
    }

    &.active {
        color: white;
        background: $primary-gradient;

        .dark & {
            color: $dark-font-color2;
        }
    }
}

.project-status-dot {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    vertical-align: 0.12em;
    cursor: help;
}

.project-header {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem 1rem;

    .project-title {
        flex: 0 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
}

.stack-actions {
    flex: 1 0 38px;
    min-width: 38px;
    align-items: center;
    justify-content: flex-end;
}

@media (max-width: 991.98px) {
    .stack-actions {
        flex-basis: 44px;
        min-width: 44px;
    }

    .editor-box :deep(.cm-editor) {
        min-height: 52dvh;
    }
}

@media (min-width: 992px) {
    .compose-page.stack-view-mode {
        display: flex;
        overflow: hidden;
        flex-direction: column;
        height: 100%;
        min-height: 0;
    }

    .stack-view-mode > .stack-content {
        --bs-gutter-x: 1rem;

        overflow: hidden;
        flex: 1 1 0;
        min-height: 0;
    }

    .stack-view-mode .containers-column,
    .stack-view-mode .compose-column {
        height: 100%;
        min-height: 0;
    }

    .stack-view-mode .containers-column {
        display: flex;
        flex-direction: column;
    }

    .stack-view-mode .container-list {
        overflow-y: auto;
        flex: 1 1 auto;
        min-height: 0;
        overscroll-behavior: contain;
    }

    .stack-view-mode .compose-column {
        display: flex;
        overflow: hidden;
        flex-direction: column;
        overscroll-behavior: contain;
    }

    .stack-view-mode .compose-column > .editor-box {
        overflow: hidden;
        flex: 1 1 auto;
        min-height: 0;
        margin-bottom: 0 !important;
    }

    .compose-page.full-page-editor {
        display: flex;
        overflow: hidden;
        flex-direction: column;
        height: 100%;
        min-height: 0;
    }

    .full-page-editor > .stack-content {
        --bs-gutter-x: 0;

        overflow: hidden;
        flex: 1 1 auto;
        min-height: 0;
    }

    .full-page-editor .compose-column {
        display: flex;
        overflow: hidden;
        flex-direction: column;
        height: 100%;
        min-height: 0;
    }

    .full-page-editor .compose-column > .editor-box {
        overflow: hidden;
        flex: 1 1 auto;
        min-height: 0;
        padding-bottom: 0;
        margin-bottom: 0 !important;
    }

    .full-page-editor .compose-column > .editor-box :deep(.vue-codemirror) {
        overflow: hidden;
        flex: 1 1 auto;
        min-height: 0;
    }

    .full-page-editor .compose-column > .editor-box :deep(.cm-editor) {
        height: 100%;
        min-height: 0;
    }

    .full-page-editor .compose-column > .editor-box :deep(.cm-scroller) {
        overflow: auto;
    }
}

.action-commands {
    margin-top: 0.75rem;

    pre {
        margin: 0;
        padding: 0.65rem 0.75rem;
        border-radius: 0.35rem;
        background: rgba(0, 0, 0, 0.28);
        overflow-x: auto;
    }

    code {
        display: block;
        padding: 0;
        color: $dark-font-color;
        font-family: "JetBrains Mono", ui-monospace, monospace;
        font-size: 0.8rem;
        line-height: 1.45;
        white-space: pre;
        background: transparent;
    }

    code + code {
        margin-top: 0.15rem;
    }

    .action-command-prompt {
        color: #7ee787;
    }
}
</style>

<style lang="scss">
@import "../styles/vars.scss";

.progress-terminal-dialog.floating-dialog {
    // Wide enough for TERMINAL_COLS (105) at 14px mono without wrapping progress lines
    --fd-width: 940px;
    overflow: hidden;
    border: 1px solid $dark-border-color;
    background: $dark-bg;
    color: $dark-font-color;
    box-shadow: 0 25px 70px rgba(0, 0, 0, 0.45);

    .fd-header {
        gap: 0.5rem;
        min-height: 34px;
        padding: 0.3rem 0.4rem 0.3rem 0.65rem;
        border-bottom: 1px solid $dark-border-color;
    }

    .progress-header-bar {
        display: flex;
        flex: 1 1 auto;
        align-items: center;
        gap: 0.75rem;
        min-width: 0;
    }

    .progress-dialog-title {
        overflow: hidden;
        flex: 1 1 auto;
        min-width: 0;
        margin: 0;
        color: $dark-font-color;
        font-size: 0.8rem;
        font-weight: 600;
        letter-spacing: 0.01em;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .progress-header-tools {
        display: flex;
        flex: 0 0 auto;
        align-items: center;
        gap: 0.15rem;

        .btn {
            display: inline-flex;
            align-items: center;
            gap: 0.35rem;
            min-height: 24px !important;
            height: 24px;
            padding: 0 0.45rem !important;
            border: 1px solid transparent !important;
            border-radius: 4px;
            color: #8b949e !important;
            font-size: 0.7rem;
            font-weight: 500;
            line-height: 1;
            background: transparent !important;
            box-shadow: none !important;

            .svg-inline--fa {
                font-size: 0.65rem;
                opacity: 0.9;
            }

            &:hover,
            &:focus-visible {
                color: #e6edf3 !important;
                background: rgba(255, 255, 255, 0.06) !important;
                border-color: rgba(255, 255, 255, 0.08) !important;
            }

            &:disabled {
                opacity: 0.35;
            }
        }
    }

    .fd-close {
        flex: 0 0 auto;
        width: 26px;
        height: 26px;
        border-radius: 6px;
        color: $dark-font-color;
    }

    .fd-body {
        display: flex;
        flex-direction: column;
        padding: 0;
        min-height: 0;
        background: #000;
    }

    .progress-terminal.terminal-shell,
    .progress-terminal {
        flex: 1 1 auto;
        // 8 rows × ~18px cell height — keep in sync with PROGRESS_TERMINAL_ROWS
        height: 144px;
        margin: 0;
        padding: 0;
        border: 0;
        border-radius: 0;
        box-shadow: none !important;
        background: #000 !important;
    }

    .progress-terminal .main-terminal {
        overflow: hidden;
        height: 100%;
        padding: 0 !important;
    }

    // Progress output is short; xterm's always-on scrollbars were showing as a
    // thick grey bar under the last line.
    .progress-terminal .xterm,
    .progress-terminal .xterm-viewport {
        overflow: hidden !important;
    }

    .progress-terminal .xterm-viewport {
        width: 100% !important;
        height: 100% !important;
    }

    .progress-terminal .xterm-screen {
        width: 100% !important;
    }
}

.stack-path-menu.floating-menu-panel {
    padding: 0.35rem;
    border: 1px solid $dark-border-color;
    border-radius: 10px;
    background: $dark-bg;
    color: $dark-font-color;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);

    .stack-path-option {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.15rem;
        width: 100%;
        padding: 0.55rem 0.7rem;
        border-radius: 8px;
        font-family: "JetBrains Mono", ui-monospace, monospace;
        font-size: 0.8rem;
        line-height: 1.35;
        white-space: normal;
        overflow-wrap: anywhere;
        word-break: break-all;
    }

    .stack-path-option-dir {
        color: $dark-font-color3;
    }

    .stack-path-option-name {
        color: #fff;

        &.is-placeholder {
            opacity: 0.45;
        }
    }

    .stack-path-option-agent {
        color: $dark-font-color;
        font-family: inherit;
        font-size: 0.75rem;
    }

    .stack-path-option.active {
        background: rgba($primary, 0.18);
    }

    .stack-path-option:hover:not(:disabled),
    .stack-path-option:focus-visible {
        background: rgba(255, 255, 255, 0.06);
        outline: none;
    }

    .stack-path-option:disabled {
        opacity: 0.45;
    }
}
</style>
