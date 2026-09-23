<template>
    <div class="shadow-box big-padding mb-3 container">
        <div class="row">
            <div class="col-5">
                <h4>{{ name }}</h4>
                <div class="image mb-2">
                    <span class="tag">{{ imageDisplay }}</span>
                </div>
                <div v-if="!isEditMode">
                    <span class="badge me-1" :class="bgStyle">{{ status }}</span>

                    <a v-for="port in (envsubstService.ports || [])" :key="port" :href="parsePort(port).url" target="_blank">
                        <span class="badge me-1 bg-secondary">{{ parsePort(port).display }}</span>
                    </a>
                </div>
            </div>
            <div class="col-7">
                <div class="function">
                    <div class="btn-group me-2" role="group">
                        <router-link v-if="!isEditMode && (status === 'running' || status === 'healthy')" class="btn btn-normal" :to="terminalRouteLink" disabled="">
                            <font-awesome-icon icon="terminal" />
                            Bash
                        </router-link>
                        <button
                            v-if="serviceCount > 1 && !isEditMode && status !== 'running' && status !== 'healthy'"
                            class="btn btn-primary"
                            :disabled="processing"
                            @click="startService"
                        >
                            <font-awesome-icon icon="play" class="me-1" />
                            {{ $t("startStack") }}
                        </button>
                        <button
                            v-if="serviceCount > 1 && !isEditMode && (status === 'running' || status === 'healthy' || status === 'unhealthy')"
                            class="btn btn-normal"
                            :disabled="processing"
                            @click="restartService"
                        >
                            <font-awesome-icon icon="rotate" class="me-1" />
                            {{ $t("restartStack") }}
                        </button>
                        <button
                            v-if="serviceCount > 1 && !isEditMode && (status === 'running' || status === 'healthy' || status === 'unhealthy')"
                            class="btn btn-normal"
                            :disabled="processing"
                            @click="stopService"
                        >
                            <font-awesome-icon icon="stop" class="me-1" />
                            {{ $t("stopStack") }}
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <div v-if="serviceStatus.length > 0" class="container-instances mt-3">
            <div v-for="instance in serviceStatus" :key="instance.name" class="instance-row">
                <div class="instance-summary">
                    <div class="instance-name">{{ instance.name }}</div>
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
                <div class="instance-actions btn-group" role="group">
                    <router-link class="btn btn-sm btn-normal" :to="containerDetailsRoute(instance)">
                        <font-awesome-icon icon="info-circle" class="me-1" /> {{ $t("details") }}
                    </router-link>
                    <router-link class="btn btn-sm btn-normal" :to="containerDetailsRoute(instance, 'logs')">
                        <font-awesome-icon icon="list" class="me-1" /> {{ $t("logs") }}
                    </router-link>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { defineComponent } from "vue";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { parseDockerPort } from "../../../common/util-common";

export default defineComponent({
    components: {
        FontAwesomeIcon
    },
    props: {
        name: {
            type: String,
            required: true,
        },
        isEditMode: {
            type: Boolean,
            default: false,
        },
        first: {
            type: Boolean,
            default: false,
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
        }
    },
    methods: {
        parsePort(port) {
            if (this.stack.endpoint) {
                return parseDockerPort(port, this.stack.primaryHostname);
            } else {
                let hostname = this.$root.info.primaryHostname || location.hostname;
                return parseDockerPort(port, hostname);
            }
        },
        startService() {
            this.$emit("start-service", this.name);
        },
        stopService() {
            this.$emit("stop-service", this.name);
        },
        restartService() {
            this.$emit("restart-service", this.name);
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

.container {
    .image {
        font-size: 0.8rem;
        color: #6c757d;
        .tag {
            color: var(--bs-heading-color);
        }
    }

    .function {
        align-content: center;
        display: flex;
        height: 100%;
        width: 100%;
        align-items: center;
        justify-content: end;
    }

    .stats {
        font-size: 0.8rem;
        color: #6c757d;
    }

    .container-instances {
        border-top: 1px solid $dark-border-color;
    }

    .instance-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding-top: 0.85rem;
    }

    .instance-name {
        overflow-wrap: anywhere;
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.9rem;
    }

    @media (max-width: 575.98px) {
        > .row > [class*="col-"] {
            width: 100%;
        }

        .function {
            justify-content: flex-start;
            margin-top: 0.75rem;
        }

        .function .btn-group {
            display: flex;
            flex-wrap: wrap;
            width: 100%;
        }

        .function .btn {
            flex: 1 1 auto;
        }

        .instance-row {
            align-items: stretch;
            flex-direction: column;
        }

        .instance-actions {
            display: flex;
        }

        .instance-actions .btn {
            flex: 1;
        }
    }
}
</style>
