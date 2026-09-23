<template>
    <!-- Compact: no desktop chrome — pages fill <main> directly -->
    <router-view v-if="$root.isCompact" :key="$route.fullPath" />

    <!-- Desktop: sticky sidebar + independent content scroll -->
    <div v-else class="dashboard">
        <aside v-show="!sidebarCollapsed" id="projects-sidebar" class="dashboard-sidebar">
            <div class="d-flex align-items-center gap-3 mb-3 sidebar-heading">
                <h1 class="mb-0">{{ $t("stacks") }}</h1>
                <router-link to="/compose" class="btn btn-primary btn-sm add-stack" :aria-label="$t('compose')" :title="$t('compose')">
                    <font-awesome-icon icon="plus" />
                </router-link>
            </div>
            <div class="sidebar-list-wrap">
                <StackList :scrollbar="true" />
            </div>
            <button
                type="button"
                class="sidebar-rail-toggle is-collapse"
                :aria-label="$t('collapseProjects')"
                :title="$t('collapseProjects')"
                aria-controls="projects-sidebar"
                :aria-expanded="true"
                @click="sidebarCollapsed = true"
            >
                <font-awesome-icon icon="chevron-left" />
            </button>
        </aside>

        <button
            v-if="sidebarCollapsed"
            type="button"
            class="sidebar-rail-toggle is-reopen"
            :aria-label="$t('expandProjects')"
            :title="$t('expandProjects')"
            aria-controls="projects-sidebar"
            :aria-expanded="false"
            @click="sidebarCollapsed = false"
        >
            <font-awesome-icon icon="chevron-right" />
        </button>

        <div class="dashboard-content" :class="{ 'main-expanded': sidebarCollapsed }">
            <router-view :key="$route.fullPath" />
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
            sidebarCollapsed: false,
        };
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

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

.dashboard {
    position: relative;
    display: flex;
    gap: 1rem;
    width: 100%;
    height: 100%;
    min-height: 0;
    padding-left: 12px;
}

.dashboard-sidebar {
    display: flex;
    flex-direction: column;
    flex: 0 0 28%;
    max-width: 360px;
    min-width: 260px;
    height: 100%;
    min-height: 0;
    position: sticky;
    top: 0;
    align-self: flex-start;
    padding-top: 12px;
    padding-bottom: 1rem;
}

.sidebar-heading {
    flex: 0 0 auto;
}

.sidebar-list-wrap {
    position: relative;
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    min-height: 0;
}

.sidebar-rail-toggle {
    z-index: 10;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 44px;
    padding: 0;
    border: 0;
    border-radius: 999px;
    color: $dark-font-color;
    background: $dark-header-bg;
    font-size: 0.65rem;
    line-height: 1;
    box-shadow: none;
    appearance: none;
    transition: color 0.15s ease, background 0.15s ease;

    &:hover,
    &:focus-visible {
        color: #000;
        background: $primary-gradient;
        outline: none;
        border: 0;
        box-shadow: none;
    }
}

.sidebar-rail-toggle.is-collapse {
    position: absolute;
    top: 50%;
    right: 0;
    // Sit on the gutter between sidebar and content
    transform: translate(50%, -50%);
}

.sidebar-rail-toggle.is-reopen {
    position: absolute;
    top: 50%;
    left: 0;
    transform: translateY(-50%);
    // Match full-pill end caps (half of width), not half of height
    border-radius: 0 9px 9px 0;
}

.dashboard-sidebar > .sidebar-list-wrap > :deep(.stack-list-box) {
    flex: 1 1 0;
    min-height: 0;
    height: auto;
    max-height: none;
    position: static;
    margin-bottom: 0 !important;
}

.dashboard-content {
    flex: 1 1 0;
    min-width: 0;
    min-height: 0;
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 12px 12px 1rem 0;
    overscroll-behavior: contain;
}

.dashboard-content.main-expanded {
    flex-basis: 100%;
}
</style>
