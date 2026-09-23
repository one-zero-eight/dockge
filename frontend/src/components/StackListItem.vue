<template>
    <div class="stack-tree" :class="{ dim: !stack.isManagedByDockge }">
        <div class="stack-row" :class="{ selected: $route.path === url && !$route.hash }" @click.self="stack.isManagedByDockge && $event.detail <= 1 && changeCollapsed()" @dblclick.prevent="stack.isManagedByDockge && $event.target !== $event.currentTarget && changeCollapsed()">
            <button class="tree-toggle" :class="{ 'unmanaged-toggle': !stack.isManagedByDockge }" :disabled="!stack.isManagedByDockge" :aria-expanded="stack.isManagedByDockge ? !isCollapsed : undefined" :aria-label="stackName" @click="$event.detail <= 1 && changeCollapsed()" @dblclick.stop.prevent>
                <font-awesome-icon icon="chevron-down" :class="{ collapsed: isCollapsed }" />
            </button>
            <router-link :to="url" class="stack-link">
                <FloatingTooltip placement="right">
                    <template #trigger="{ triggerAttrs }">
                        <span
                            v-bind="triggerAttrs"
                            class="node-icon-tooltip"
                            :class="`text-${statusColor(stack.status)}`"
                            role="img"
                            :aria-label="$t(stackStatus.title)"
                        >
                            <font-awesome-icon icon="layer-group" class="node-icon" />
                        </span>
                    </template>
                    <span class="floating-tooltip-title">{{ $t(stackStatus.title) }}</span>
                    <span class="floating-tooltip-detail">{{ stackStatus.detail }}</span>
                </FloatingTooltip>
                <span class="node-name" :title="stackName">{{ stackName }}</span>
            </router-link>
        </div>
        <ul v-if="stack.isManagedByDockge && !isCollapsed" class="tree-children">
            <li v-if="loading" class="tree-message">{{ $t("loading") }}</li>
            <li v-else-if="error" class="tree-message text-danger" role="alert">{{ error }}</li>
            <li v-else-if="services.length === 0" class="tree-message">{{ $t("noServices") }}</li>
            <li v-for="service in services" v-else :key="service.name">
                <div class="tree-row" :class="{ selected: $route.path === url && $route.hash === '#service-' + encodeURIComponent(service.name) }" @click.self="$event.detail <= 1 && service.instances.length && toggleService(service.name)" @dblclick.prevent="$event.target !== $event.currentTarget && service.instances.length && toggleService(service.name)">
                    <button class="tree-toggle" :disabled="service.instances.length === 0" :aria-expanded="!collapsedServices.has(service.name)" :aria-label="service.name" @click="$event.detail <= 1 && toggleService(service.name)" @dblclick.stop.prevent>
                        <font-awesome-icon icon="chevron-down" :class="{ collapsed: collapsedServices.has(service.name) }" />
                    </button>
                    <router-link :to="{ path: url, hash: '#service-' + encodeURIComponent(service.name) }" class="tree-link">
                        <font-awesome-icon icon="cubes" class="node-icon" :class="service.instances.some(instance => instance.state === 'running') ? 'text-primary' : 'text-secondary'" />
                        <span class="node-name" :title="service.name">{{ service.name }}</span>
                    </router-link>
                </div>
                <ul v-if="!collapsedServices.has(service.name) && service.instances.length" class="tree-children">
                    <li v-for="instance in service.instances" :key="instance.name">
                        <router-link :to="containerRoute(instance)" class="tree-link container-link">
                            <font-awesome-icon icon="cube" class="node-icon" :class="instance.health === 'unhealthy' ? 'text-danger' : instance.state === 'running' ? 'text-primary' : 'text-secondary'" :title="instance.status" />
                            <span class="node-name" :title="instance.name">{{ instance.name }}</span>
                        </router-link>
                    </li>
                </ul>
            </li>
        </ul>
    </div>
</template>

<script>
import { parse } from "yaml";
import { statusColor, stackStatusDetail, stackStatusTitle } from "../../../common/util-common";
import { FloatingTooltip } from "./floating";

export default {
    components: {
        FloatingTooltip,
    },
    props: {
        /** Stack this represents */
        stack: {
            type: Object,
            default: null,
        },
        /** If the user is in select mode */
        isSelectMode: {
            type: Boolean,
            default: false,
        },
        /** How many ancestors are above this stack */
        depth: {
            type: Number,
            default: 0,
        },
        /** Callback to determine if stack is selected */
        isSelected: {
            type: Function,
            default: () => {}
        },
        /** Callback fired when stack is selected */
        select: {
            type: Function,
            default: () => {}
        },
        /** Callback fired when stack is deselected */
        deselect: {
            type: Function,
            default: () => {}
        },
    },
    data() {
        return {
            statusColor,
            isCollapsed: true,
            collapsedServices: new Set(),
            services: [],
            loading: false,
            error: "",
            refreshTimer: null,
            requestVersion: 0,
        };
    },
    computed: {
        endpointDisplay() {
            return this.$root.endpointDisplayFunction(this.stack.endpoint);
        },
        url() {
            if (this.stack.endpoint) {
                return `/compose/${this.stack.name}/${this.stack.endpoint}`;
            } else {
                return `/compose/${this.stack.name}`;
            }
        },
        depthMargin() {
            return {
                marginLeft: `${31 * this.depth}px`,
            };
        },
        stackName() {
            return this.stack.name;
        },
        /**
         * Status tooltip of the stack: a sentence plus the raw compose status.
         * @returns {object}
         */
        stackStatus() {
            return {
                title: stackStatusTitle(this.stack),
                detail: this.formatStackStatusDetail(this.stack),
            };
        },
    },
    watch: {
        isSelectMode() {
            // TODO: Resize the heartbeat bar, but too slow
            // this.$refs.heartbeatBar.resize();
        }
    },
    beforeUnmount() {
        this.requestVersion++;
        clearTimeout(this.refreshTimer);
    },
    methods: {
        /**
         * Localize the status detail line under the stack icon tooltip.
         * Compose statuses are shown as "containers running(1), …".
         * @param {object|null|undefined} stack Stack status payload.
         * @returns {string}
         */
        formatStackStatusDetail(stack) {
            if (stack?.composeStatus) {
                return this.$t("projectStatusContainers", { status: stack.composeStatus });
            }
            const detail = stackStatusDetail(stack);
            return this.$te(detail) ? this.$t(detail) : detail;
        },
        changeCollapsed() {
            if (!this.stack.isManagedByDockge) {
                return;
            }
            this.isCollapsed = !this.isCollapsed;
            this.requestVersion++;
            clearTimeout(this.refreshTimer);
            if (!this.isCollapsed) {
                this.loadServices();
            }
        },
        toggleService(name) {
            if (this.collapsedServices.has(name)) {
                this.collapsedServices.delete(name);
            } else {
                this.collapsedServices.add(name);
            }
        },
        containerRoute(instance) {
            const params = { stackName: this.stack.name,
                containerName: instance.name };
            if (this.stack.endpoint) {
                params.endpoint = this.stack.endpoint;
            }
            return {
                name: this.stack.endpoint ? "containerDetailsEndpoint" : "containerDetails",
                params,
            };
        },
        requestTreeData(event) {
            return new Promise((resolve, reject) => {
                this.$root.getSocket().timeout(10000).emit("agent", this.stack.endpoint, event, this.stack.name, (error, res) => {
                    if (error) {
                        reject(error);
                    } else if (!res.ok) {
                        reject(new Error(res.msg));
                    } else {
                        resolve(res);
                    }
                });
            });
        },
        async loadServices() {
            const version = ++this.requestVersion;
            this.loading = this.services.length === 0;
            this.error = "";
            try {
                const [ stackResponse, statusResponse ] = await Promise.all([
                    this.requestTreeData("getStack"),
                    this.requestTreeData("serviceStatusList"),
                ]);
                if (version !== this.requestVersion) {
                    return;
                }
                const config = parse(stackResponse.stack.composeYAML);
                const statuses = statusResponse.serviceStatusList;
                const names = new Set([ ...Object.keys(config?.services || {}), ...Object.keys(statuses) ]);
                this.services = [ ...names ].sort((a, b) => a.localeCompare(b)).map(name => ({
                    name,
                    instances: (statuses[name] || []).slice().sort((a, b) => a.name.localeCompare(b.name)),
                }));
            } catch (error) {
                if (version === this.requestVersion) {
                    this.error = error.message;
                }
            } finally {
                if (version === this.requestVersion) {
                    this.loading = false;
                    this.refreshTimer = setTimeout(() => this.loadServices(), 10000);
                }
            }
        },

        /**
         * Toggle selection of stack
         * @returns {void}
         */
        toggleSelection() {
            if (this.isSelected(this.stack.id)) {
                this.deselect(this.stack.id);
            } else {
                this.select(this.stack.id);
            }
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

.stack-tree {
    --tree-indent: 0px;

    user-select: none;
}

.stack-row,
.tree-row,
.container-link {
    position: relative;
    isolation: isolate;
    display: flex;
    align-items: center;
    min-width: 0;
    min-height: 34px;
    margin-inline-start: calc(-1 * var(--tree-indent));
    padding-inline-start: var(--tree-indent);
    cursor: pointer;

    &::before {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: 3px;
        z-index: -1;
        pointer-events: none;
    }

    &:hover::before,
    &:focus-within::before {
        background: rgba($primary, 0.08);
    }

    &.selected::before,
    &.container-link.active::before {
        background: rgba($primary, 0.24);
    }
}

.tree-row > .tree-link {
    flex: 1;
}

.tree-toggle {
    flex: 0 0 30px;
    width: 30px;
    min-height: 34px;
    padding: 0;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: inherit;
    font-size: 0.8rem;

    &:disabled:not(.unmanaged-toggle) {
        visibility: hidden;
    }

    &.unmanaged-toggle:disabled {
        opacity: 0.35;
        cursor: default;
    }
}

.tree-children {
    --tree-indent: 16px;

    list-style: none;
    margin: 0;
    padding: 0 0 0 16px;

    .tree-children {
        --tree-indent: 32px;
    }
}

.tree-link,
.stack-link {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    min-height: 34px;
    padding: 3px 4px;
    color: inherit;
    text-decoration: none;
    font-size: 1rem;
}

.container-link {
    padding-inline-start: calc(var(--tree-indent) + 34px);
}

.node-icon {
    width: 13px;
    flex: 0 0 13px;
}

.node-icon-tooltip {
    display: inline-flex;
    flex: 0 0 13px;
    align-items: center;
}

.node-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.tree-message {
    padding: 6px;
    font-size: 1rem;
    overflow-wrap: anywhere;
}

.stack-row .stack-link {
    min-width: 0;
    flex: 1;
    overflow-wrap: anywhere;
}

.small-padding {
    padding-left: 5px !important;
    padding-right: 5px !important;
}

.collapse-padding {
    padding-left: 8px !important;
    padding-right: 2px !important;
}

.collapsed {
    transform: rotate(-90deg);
}

.animated {
    transition: all 0.2s $easing-in;
}

.select-input-wrapper {
    float: left;
    margin-top: 15px;
    margin-left: 3px;
    margin-right: 10px;
    padding-left: 4px;
    position: relative;
    z-index: 15;
}

.dim {
    opacity: 0.5;
}

</style>
