<template>
    <div :id="'service-' + encodeURIComponent(name)" class="shadow-box big-padding mb-3 container">
        <div class="title-row">
            <h4 class="title-text">
                <router-link v-if="!isEditMode && serviceStatus.length > 0" class="title-link" :to="containerDetailsRoute(serviceStatus[0])">
                    <span>{{ name }}</span>
                </router-link>
                <span v-else>{{ name }}</span>
                <span class="entity-label">{{ $t("service") }}</span>
            </h4>
            <div v-if="!isEditMode" class="title-actions btn-group btn-group-sm" role="group">
                <router-link
                    v-if="status === 'running' || status === 'healthy'"
                    class="btn btn-sm btn-normal"
                    :to="terminalRouteLink"
                >
                    <font-awesome-icon icon="terminal" /><span>Bash</span>
                </router-link>
                <button
                    v-if="serviceCount > 1 && status !== 'running' && status !== 'healthy'"
                    class="btn btn-sm btn-primary"
                    :disabled="processing"
                    @click="startService"
                >
                    <font-awesome-icon icon="play" /><span>{{ $t("startStack") }}</span>
                </button>
                <button
                    v-if="serviceCount > 1 && (status === 'running' || status === 'healthy' || status === 'unhealthy')"
                    class="btn btn-sm btn-normal"
                    :disabled="processing"
                    @click="restartService"
                >
                    <font-awesome-icon icon="rotate" /><span>{{ $t("restartStack") }}</span>
                </button>
                <button
                    v-if="serviceCount > 1 && (status === 'running' || status === 'healthy' || status === 'unhealthy')"
                    class="btn btn-sm btn-normal"
                    :disabled="processing"
                    @click="stopService"
                >
                    <font-awesome-icon icon="stop" /><span>{{ $t("stopStack") }}</span>
                </button>
            </div>
        </div>

        <div class="image mb-2">
            <span class="tag" :title="imageDisplay">{{ imageDisplay }}</span>
        </div>
        <div v-if="!isEditMode" class="service-meta">
            <span class="badge me-1" :class="bgStyle">{{ status }}</span>
            <a v-for="port in (envsubstService.ports || [])" :key="port" :href="parsePort(port).url" target="_blank">
                <span class="badge me-1 bg-secondary">{{ parsePort(port).display }}</span>
            </a>
        </div>

        <div v-if="isEditMode" class="mt-2">
            <button class="btn btn-normal me-2" @click="showConfig = !showConfig">
                <font-awesome-icon icon="edit" />
                {{ $t("Edit") }}
            </button>
            <button v-if="false" class="btn btn-normal me-2">Rename</button>
            <button class="btn btn-danger me-2" @click="remove">
                <font-awesome-icon icon="trash" />
                {{ $t("deleteContainer") }}
            </button>
        </div>
        <div v-else-if="serviceStatus.length > 0" class="container-instances mt-3">
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

        <transition name="slide-fade" appear>
            <div v-if="isEditMode && showConfig" class="config mt-3">
                <!-- Image -->
                <div class="mb-4">
                    <label class="form-label">
                        {{ $t("dockerImage") }}
                    </label>
                    <div class="input-group mb-3">
                        <input
                            v-model="service.image"
                            class="form-control"
                            list="image-datalist"
                        />
                    </div>

                    <!-- TODO: Search online: https://hub.docker.com/api/content/v1/products/search?q=louislam%2Fuptime&source=community&page=1&page_size=4 -->
                    <datalist id="image-datalist">
                        <option value="louislam/uptime-kuma:1" />
                    </datalist>
                    <div class="form-text"></div>
                </div>

                <!-- Ports -->
                <div class="mb-4">
                    <label class="form-label">
                        {{ $tc("port", 2) }}
                    </label>
                    <ArrayInput name="ports" :display-name="$t('port')" placeholder="HOST:CONTAINER" />
                </div>

                <!-- Volumes -->
                <div class="mb-4">
                    <label class="form-label">
                        {{ $tc("volume", 2) }}
                    </label>
                    <ArrayInput name="volumes" :display-name="$t('volume')" placeholder="HOST:CONTAINER" />
                </div>

                <!-- Restart Policy -->
                <div class="mb-4">
                    <label class="form-label">
                        {{ $t("restartPolicy") }}
                    </label>
                    <select v-model="service.restart" class="form-select">
                        <option value="always">{{ $t("restartPolicyAlways") }}</option>
                        <option value="unless-stopped">{{ $t("restartPolicyUnlessStopped") }}</option>
                        <option value="on-failure">{{ $t("restartPolicyOnFailure") }}</option>
                        <option value="no">{{ $t("restartPolicyNo") }}</option>
                    </select>
                </div>

                <!-- Environment Variables -->
                <div class="mb-4">
                    <label class="form-label">
                        {{ $tc("environmentVariable", 2) }}
                    </label>
                    <ArrayInput name="environment" :display-name="$t('environmentVariable')" placeholder="KEY=VALUE" />
                </div>

                <!-- Container Name -->
                <div v-if="false" class="mb-4">
                    <label class="form-label">
                        {{ $t("containerName") }}
                    </label>
                    <div class="input-group mb-3">
                        <input
                            v-model="service.container_name"
                            class="form-control"
                        />
                    </div>
                    <div class="form-text"></div>
                </div>

                <!-- Network -->
                <div class="mb-4">
                    <label class="form-label">
                        {{ $tc("network", 2) }}
                    </label>

                    <div v-if="networkList.length === 0 && service.networks && service.networks.length > 0" class="text-warning mb-3">
                        {{ $t("NoNetworksAvailable") }}
                    </div>

                    <ArraySelect name="networks" :display-name="$t('network')" placeholder="Network Name" :options="networkList" />
                </div>

                <!-- Depends on -->
                <div class="mb-4">
                    <label class="form-label">
                        {{ $t("dependsOn") }}
                    </label>
                    <ArrayInput name="depends_on" :display-name="$t('dependsOn')" :placeholder="$t(`containerName`)" />
                </div>
            </div>
        </transition>
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
    data() {
        return {
            showConfig: false,
        };
    },
    computed: {

        networkList() {
            let list = [];
            for (const networkName in (this.jsonObject.networks || {})) {
                list.push(networkName);
            }
            return list;
        },

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

        service() {
            if (!this.jsonObject.services || !this.jsonObject.services[this.name]) {
                return {};
            }
            return this.jsonObject.services[this.name];
        },

        jsonObject() {
            return this.$parent.$parent.jsonConfig;
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
        if (this.first) {
            //this.showConfig = true;
        }
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
        remove() {
            delete this.jsonObject.services[this.name];
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
    .title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        margin-bottom: 0.25rem;
    }

    .title-text {
        margin: 0;
        min-width: 0;
        flex: 1 1 auto;
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
        flex: 0 0 auto;
        flex-wrap: nowrap;
    }

    .title-actions .btn {
        display: inline-flex;
        flex-direction: row;
        align-items: center;
        gap: 0.35rem;
        padding: 0.15rem 0.55rem;
        font-size: 0.75rem;
        line-height: 1.25;
        min-height: 1.7rem;
        white-space: nowrap;
    }

    .title-actions .btn svg {
        width: 0.75em;
        height: 0.75em;
        flex-shrink: 0;
    }

    .image {
        font-size: 0.8rem;
        color: #6c757d;
        .tag {
            display: block;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            color: var(--bs-heading-color);
        }
    }

    .service-meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.35rem 0.5rem;
    }

    .stats {
        font-size: 0.8rem;
        color: #6c757d;
    }

    .instance-name {
        overflow-wrap: anywhere;
        font-family: "JetBrains Mono", monospace;
        font-size: 0.85rem;
        color: #6c757d;
    }

    .entity-label,
    .instance-branch {
        user-select: none;
    }

    .entity-label {
        margin-inline-start: 0.35rem;
        font-family: var(--bs-body-font-family);
        font-size: 0.75rem;
        font-weight: normal;
        text-transform: lowercase;
        opacity: 0.5;
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
    }

    .instance-row + .instance-row {
        padding-top: 0.65rem;
    }

    .instance-row .instance-name {
        color: var(--bs-heading-color);
        font-size: 0.9rem;
    }

    @media (max-width: 575.98px) {
        .title-row {
            align-items: flex-start;
            flex-direction: column;
        }

        .title-actions {
            width: 100%;
        }

        .title-actions .btn {
            flex: 1 1 auto;
        }
    }
}
</style>
