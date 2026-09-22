<template>
    <div class="container-fluid" :style="{ '--dashboard-top': dashboardTop + 'px' }">
        <div class="row" :class="{ 'sidebar-collapsed': sidebarCollapsed && !$root.isCompact }">
            <div v-if="!$root.isCompact" v-show="!sidebarCollapsed" id="projects-sidebar" class="col-12 col-lg-4 col-xl-3">
                <div class="d-flex align-items-center gap-3 mb-3">
                    <h1 class="mb-0">{{ $t("stacks") }}</h1>
                    <router-link to="/compose" class="btn btn-primary btn-sm add-stack" :aria-label="$t('compose')" :title="$t('compose')">
                        <font-awesome-icon icon="plus" />
                    </router-link>
                    <button class="sidebar-toggle ms-auto" :aria-label="$t('collapseProjects')" :title="$t('collapseProjects')" aria-controls="projects-sidebar" :aria-expanded="true" @click="sidebarCollapsed = true">
                        <font-awesome-icon icon="chevron-down" class="collapse-chevron" />
                    </button>
                </div>
                <StackList :scrollbar="true" />
            </div>

            <button v-if="!$root.isCompact && sidebarCollapsed" class="sidebar-toggle sidebar-reopen" :aria-label="$t('expandProjects')" :title="$t('expandProjects')" aria-controls="projects-sidebar" :aria-expanded="false" @click="sidebarCollapsed = false">
                <font-awesome-icon icon="chevron-down" class="expand-chevron" />
            </button>

            <div ref="container" class="col-12 mb-3 dashboard-content" :class="!$root.isCompact && !sidebarCollapsed ? 'col-lg-8 col-xl-9' : 'main-expanded'">
                <!-- Add :key to disable vue router re-use the same component -->
                <router-view :key="$route.fullPath" :calculatedHeight="height" />
            </div>
        </div>
    </div>
</template>

<script>

import StackList from "../components/StackList.vue";

export default {
    components: {
        StackList,
    },
    data() {
        return {
            height: 0,
            dashboardTop: 0,
            sidebarCollapsed: false,
        };
    },
    mounted() {
        this.updateLayoutHeight();
        window.addEventListener("resize", this.updateLayoutHeight);
    },
    beforeUnmount() {
        window.removeEventListener("resize", this.updateLayoutHeight);
    },
    methods: {
        updateLayoutHeight() {
            this.dashboardTop = this.$el.getBoundingClientRect().top + window.scrollY;
            this.height = this.$refs.container.offsetHeight;
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

.sidebar-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: inherit;

    &:hover,
    &:focus-visible {
        color: var(--bs-primary);
        background: rgba(var(--bs-primary-rgb), 0.1);
    }
}

.collapse-chevron {
    transform: rotate(90deg);
}

.expand-chevron {
    transform: rotate(-90deg);
}

.sidebar-toggle.sidebar-reopen {
    position: absolute;
    top: -1rem;
    left: calc((100% - 100vw) / 2);
    z-index: 10;
    width: 28px;
    height: 20px;
    border-radius: 0 0 8px 0;
    background: $primary-gradient;
    color: #000;
    font-size: 0.7rem;

    &:hover,
    &:focus-visible {
        background: $primary-gradient-active;
        color: #000;
    }
}

.add-stack {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 32px;
    height: 32px;
    padding: 0;
    border-radius: 50%;
}

.container-fluid {
    position: relative;
    width: 98%;
}

@media (min-width: 992px) {
    .container-fluid {
        width: 100%;
        padding-left: calc(1% + 12px);
        padding-right: 8px;
    }

    .container-fluid > .row {
        --bs-gutter-x: 1rem;

        height: calc(100dvh - var(--dashboard-top));
        min-height: 0;
    }

    .dashboard-content {
        height: calc(100% + 1rem);
        margin-top: -1rem;
        padding-top: 1rem;
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;
        margin-bottom: 0 !important;
        padding-bottom: 1rem;
        overscroll-behavior: contain;
    }

    #projects-sidebar {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
    }

    #projects-sidebar > :deep(.shadow-box) {
        height: auto !important;
        flex: 1;
        min-height: 0;
    }
}
</style>
