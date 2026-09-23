<template>
    <div :id="'service-' + encodeURIComponent(name)" class="shadow-box mb-3 service-card">
        <div class="title-row">
            <h4 class="title-text">
                <router-link v-if="serviceStatus.length > 0" class="title-link" :to="containerDetailsRoute(serviceStatus[0])">
                    <span>{{ name }}</span>
                </router-link>
                <span v-else>{{ name }}</span>
                <span class="entity-label">{{ $t("service") }}</span>
            </h4>
            <ActionGroup
                class="title-actions"
                size="sm"
                :actions="serviceActions"
                :max-visible="3"
                :aria-label="$t('serviceActions')"
                @select="onServiceAction"
            />
        </div>

        <div class="image mb-2">
            <span class="tag" :title="imageDisplay">{{ imageDisplay }}</span>
        </div>
        <div class="service-meta">
            <span class="badge me-1" :class="bgStyle">{{ status }}</span>
            <a v-for="port in (envsubstService.ports || [])" :key="port" :href="parsePort(port).url" target="_blank">
                <span class="badge me-1 bg-secondary">{{ parsePort(port).display }}</span>
            </a>
        </div>

        <div v-if="serviceStatus.length > 0" class="container-instances mt-3">
            <div v-for="instance in serviceStatus" :key="instance.name" class="instance-row">
                <div class="title-row">
                    <div class="instance-name title-text">
                        <span class="instance-branch" aria-hidden="true">↳</span>
                        <router-link class="title-link" :to="containerDetailsRoute(instance)">
                            <span>{{ instance.name }}</span>
                        </router-link>
                        <span class="entity-label">{{ $tc("container", 1) }}</span>
                    </div>
                </div>
                <div class="d-flex flex-wrap align-items-center gap-2 mt-1">
                    <span class="badge" :class="instanceStatusClass(instance)">{{ instance.status }}</span>
                    <span v-if="dockerStats[instance.name]" class="stats">
                        {{ $t("CPU") }}: {{ dockerStats[instance.name].CPUPerc }}
                    </span>
                    <span v-if="dockerStats[instance.name]" class="stats">
                        {{ $t("memoryAbbreviated") }}: {{ dockerStats[instance.name].MemUsage }}
                    </span>
                </div>
            </div>
        </div>

        <FloatingDialog
            v-model="showActionDialog"
            size="sm"
            :title="$t(actionConfirm.title)"
            :ok-title="$t(actionConfirm.ok)"
            :cancel-title="$t('cancel')"
            :ok-variant="actionConfirm.variant"
            :busy="processing"
            @ok="confirmServiceAction"
            @hidden="clearPendingAction"
        >
            <p class="mb-2">{{ $t(actionConfirm.message, { name }) }}</p>
            <div v-if="actionConfirm.commands?.length" class="action-commands">
                <pre><code v-for="(cmd, i) in actionConfirm.commands" :key="i"><span class="action-command-prompt">$</span> {{ cmd }}</code></pre>
            </div>
        </FloatingDialog>
    </div>
</template>

<script>
import { defineComponent } from "vue";
import ActionGroup from "./ActionGroup.vue";
import { FloatingDialog } from "./floating";
import { parseDockerPort } from "../../../common/util-common";

/**
 * Confirmation copy + compose command for each service control.
 * `command` is a template; `{service}` is replaced with the service name.
 */
const SERVICE_ACTIONS = {
    start: {
        title: "startServiceConfirmTitle",
        message: "startServiceConfirmMsg",
        ok: "startStack",
        variant: "btn-primary",
        command: "docker compose up -d {service}",
        emit: "start-service",
    },
    stop: {
        title: "stopServiceConfirmTitle",
        message: "stopServiceConfirmMsg",
        ok: "stopStack",
        variant: "btn-warning",
        command: "docker compose stop {service}",
        emit: "stop-service",
    },
    restart: {
        title: "restartServiceConfirmTitle",
        message: "restartServiceConfirmMsg",
        ok: "restartStack",
        variant: "btn-primary",
        command: "docker compose restart {service}",
        emit: "restart-service",
    },
};

export default defineComponent({
    components: {
        ActionGroup,
        FloatingDialog,
    },
    props: {
        name: {
            type: String,
            required: true,
        },
        serviceStatus: {
            type: Array,
            default: () => [],
        },
        dockerStats: {
            type: Object,
            default: () => ({}),
        },
        serviceCount: {
            type: Number,
            default: 1,
        }
    },
    emits: [
        "start-service",
        "stop-service",
        "restart-service"
    ],
    data() {
        return {
            showActionDialog: false,
            pendingAction: null,
        };
    },
    computed: {

        bgStyle() {
            if (this.status === "running" || this.status === "healthy") {
                return "bg-primary";
            } else if (this.status === "unhealthy") {
                return "bg-danger";
            } else {
                return "bg-secondary";
            }
        },

        isRunning() {
            return this.status === "running" || this.status === "healthy" || this.status === "unhealthy";
        },

        canOpenBash() {
            return this.status === "running" || this.status === "healthy";
        },

        processing() {
            return !!this.$parent?.$parent?.processing;
        },

        /**
         * Service controls for the title ActionGroup.
         * @returns {object[]}
         */
        serviceActions() {
            if (this.isRunning) {
                return [
                    { key: "restart",
                        i18nKey: "restartStack",
                        icon: "rotate",
                        variant: "btn-normal" },
                    { key: "stop",
                        i18nKey: "stopStack",
                        icon: "stop",
                        variant: "btn-warning" },
                    { key: "bash",
                        label: "Bash",
                        icon: "terminal",
                        variant: "btn-normal",
                        hidden: !this.canOpenBash },
                ];
            }

            return [
                { key: "start",
                    i18nKey: "startStack",
                    icon: "play",
                    variant: "btn-primary" },
            ];
        },

        /**
         * Copy + command for the pending service action confirm dialog.
         * @returns {{ title: string, message: string, ok: string, variant: string, commands: string[], emit: string }}
         */
        actionConfirm() {
            const base = SERVICE_ACTIONS[this.pendingAction] ?? SERVICE_ACTIONS.start;
            const command = base.command.replaceAll("{service}", this.name);
            return {
                ...base,
                commands: [ command ],
            };
        },

        terminalRouteLink() {
            if (this.endpoint) {
                return {
                    name: "containerTerminalEndpoint",
                    params: {
                        endpoint: this.endpoint,
                        stackName: this.stackName,
                        serviceName: this.name,
                        type: "bash",
                    },
                };
            } else {
                return {
                    name: "containerTerminal",
                    params: {
                        stackName: this.stackName,
                        serviceName: this.name,
                        type: "bash",
                    },
                };
            }
        },

        endpoint() {
            return this.$parent.$parent.endpoint;
        },

        stack() {
            return this.$parent.$parent.stack;
        },

        stackName() {
            return this.$parent.$parent.stack.name;
        },

        envsubstJSONConfig() {
            return this.$parent.$parent.envsubstJSONConfig;
        },

        envsubstService() {
            if (!this.envsubstJSONConfig.services || !this.envsubstJSONConfig.services[this.name]) {
                return {};
            }
            return this.envsubstJSONConfig.services[this.name];
        },

        imageDisplay() {
            return this.envsubstService.image || this.serviceStatus[0]?.image || "";
        },
        status() {
            if (this.serviceStatus.length === 0) {
                return "N/A";
            }
            return this.serviceStatus[0].status;
        },
    },
    watch: {
        "$route.hash"() {
            this.scrollToService();
        },
    },
    mounted() {
        this.scrollToService();
    },
    methods: {
        scrollToService() {
            if (this.$route.hash === "#service-" + encodeURIComponent(this.name)) {
                this.$nextTick(() => this.$el.scrollIntoView({ block: "nearest" }));
            }
        },
        parsePort(port) {
            if (this.stack.endpoint) {
                return parseDockerPort(port, this.stack.primaryHostname);
            } else {
                let hostname = this.$root.info.primaryHostname || location.hostname;
                return parseDockerPort(port, hostname);
            }
        },
        onServiceAction(key) {
            if (key === "bash") {
                this.$router.push(this.terminalRouteLink);
                return;
            }
            if (this.processing || !SERVICE_ACTIONS[key]) {
                return;
            }
            this.pendingAction = key;
            this.showActionDialog = true;
        },
        confirmServiceAction() {
            if (this.processing || !this.pendingAction) {
                return;
            }
            const action = SERVICE_ACTIONS[this.pendingAction];
            this.showActionDialog = false;
            if (action) {
                this.$emit(action.emit, this.name);
            }
        },
        clearPendingAction() {
            this.pendingAction = null;
        },
        containerDetailsRoute(instance, tab) {
            const route = {
                name: this.endpoint ? "containerDetailsEndpoint" : "containerDetails",
                params: {
                    stackName: this.stackName,
                    containerName: instance.name,
                },
            };
            if (this.endpoint) {
                route.params.endpoint = this.endpoint;
            }
            if (tab) {
                route.query = { tab };
            }
            return route;
        },
        instanceStatusClass(instance) {
            if (instance.health === "unhealthy") {
                return "bg-danger";
            }
            return instance.state === "running" ? "bg-primary" : "bg-secondary";
        }

    }
});
</script>

<style scoped lang="scss">
@import "../styles/vars";

.service-card {
    width: 100%;
    // Match editor-box toolbar padding so the service title sits on the
    // same line as `compose.yaml`.
    padding: 0.55rem 0.75rem 1.25rem;

    .title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        min-height: 28px;
        margin-bottom: 0.25rem;
        flex-wrap: nowrap;
    }

    .title-text {
        margin: 0;
        min-width: 0;
        flex: 1 1 auto;
        line-height: 1.25;
    }

    h4.title-text {
        font-size: 1.25rem;
    }

    .title-link {
        color: inherit;
        text-decoration: none;
        overflow-wrap: anywhere;
        border-radius: 0.2rem;
        transition: color 0.15s ease;

        &:hover,
        &:focus-visible {
            color: $primary;
            text-decoration: none;
        }

        &:focus-visible {
            outline: 2px solid currentColor;
            outline-offset: 3px;
        }
    }

    .title-actions {
        flex: 1 1 140px;
        min-width: 38px;
        max-width: 65%;
        justify-content: flex-end;
    }

    .image {
        word-break: break-all;
        font-size: 0.9rem;
        color: $dark-font-color3;
    }

    .service-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem 0.5rem;
        align-items: center;
    }

    .stats {
        font-size: 0.8rem;
        color: $dark-font-color3;
    }

    .entity-label {
        margin-inline-start: 0.35rem;
        font-family: var(--bs-body-font-family);
        font-size: 0.75rem;
        font-weight: normal;
        text-transform: lowercase;
        opacity: 0.5;
        user-select: none;
    }

    h4 .entity-label {
        font-size: 0.875rem;
    }

    .container-instances {
        padding-inline-start: 1rem;
    }

    .instance-name {
        position: relative;
    }

    .instance-branch {
        position: absolute;
        inset-inline-start: -1rem;
        opacity: 0.5;
        user-select: none;
    }

    .instance-row + .instance-row {
        padding-top: 0.65rem;
    }

    .instance-row .instance-name {
        color: var(--bs-heading-color);
        font-size: 0.9rem;
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
