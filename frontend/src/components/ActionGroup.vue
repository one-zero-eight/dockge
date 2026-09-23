<template>
    <div ref="root" class="action-group" :class="{ 'is-sm': size === 'sm' }" role="group" :aria-label="ariaLabel">
        <button
            v-for="action in visibleActions"
            :key="action.key"
            type="button"
            class="btn action-group-btn"
            :class="buttonClass(action)"
            :disabled="isDisabled(action)"
            :title="labelFor(action) ? undefined : titleFor(action)"
            @click="select(action)"
        >
            <font-awesome-icon v-if="action.icon" :icon="action.icon" />
            <span v-if="labelFor(action)" class="action-group-text">{{ labelFor(action) }}</span>
        </button>

        <FloatingMenu
            v-if="menuActions.length"
            :panel-class="menuPanelClass"
            :placement="placement"
            :disabled="disabled"
        >
            <template #trigger="{ triggerAttrs }">
                <button
                    v-bind="triggerAttrs"
                    type="button"
                    class="btn btn-normal btn-icon"
                    :disabled="disabled"
                    :aria-label="moreLabel || $t('actions')"
                >
                    <font-awesome-icon icon="ellipsis" />
                </button>
            </template>

            <template v-for="(action, index) in menuActions" :key="action.key">
                <div v-if="action.separatorBefore && index > 0" class="floating-menu-divider" />

                <button
                    type="button"
                    role="menuitem"
                    class="floating-menu-item"
                    :class="{
                        'text-danger': isDanger(action),
                        'text-warning': isWarning(action),
                    }"
                    :disabled="isDisabled(action)"
                    @click="select(action)"
                >
                    <font-awesome-icon v-if="action.icon" :icon="action.icon" />
                    {{ labelFor(action) }}
                </button>
            </template>
        </FloatingMenu>

        <!-- Invisible copies used to measure natural widths before deciding what fits -->
        <div ref="measure" class="action-group-measure" aria-hidden="true">
            <button
                v-for="action in candidates"
                :key="action.key"
                type="button"
                tabindex="-1"
                class="btn action-group-btn"
                :class="buttonClass(action)"
            >
                <font-awesome-icon v-if="action.icon" :icon="action.icon" />
                <span v-if="labelFor(action)" class="action-group-text">{{ labelFor(action) }}</span>
            </button>
            <button type="button" tabindex="-1" class="btn btn-normal btn-icon">
                <font-awesome-icon icon="ellipsis" />
            </button>
        </div>
    </div>
</template>

<script>
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import FloatingMenu from "./floating/FloatingMenu.vue";

/**
 * A row of buttons that degrades into an overflow menu.
 *
 * The component measures the space it was given, shows as many actions as fit
 * (never more than `maxVisible`) and moves the rest into a `…` menu.
 *
 * @typedef {object} ActionGroupItem
 * @property {string}  key                Unique id, emitted by the `select` event.
 * @property {string}  [icon]             Font Awesome icon name.
 * @property {string}  [label]            Ready to use label, takes precedence over `i18nKey`.
 * @property {string}  [i18nKey]          Translation key of the label.
 * @property {string}  [variant]          Bootstrap button variant, defaults to `btn-normal`.
 * @property {boolean} [danger]           Color the label crimson (row + menu), keep normal chrome.
 * @property {boolean} [warning]          Color the label amber (row + menu), keep normal chrome.
 * @property {boolean} [disabled]         Disable this single action.
 * @property {boolean} [menuOnly]         Never render in the row, always keep it in the menu.
 * @property {boolean} [hidden]           Skip the action entirely.
 * @property {boolean} [separatorBefore]  Draw a divider above it inside the menu.
 */
export default {
    name: "ActionGroup",
    components: {
        FontAwesomeIcon,
        FloatingMenu,
    },
    props: {
        /** Actions to render, in the order they should be considered for the row. @type {ActionGroupItem[]} */
        actions: {
            type: Array,
            default: () => [],
        },
        /** Upper bound of buttons rendered outside of the overflow menu. */
        maxVisible: {
            type: Number,
            default: 3,
        },
        /** Disable every action. */
        disabled: {
            type: Boolean,
            default: false,
        },
        /** Floating UI placement of the overflow menu. */
        placement: {
            type: String,
            default: "bottom-end",
        },
        /** Accessible name of the overflow menu trigger. */
        moreLabel: {
            type: String,
            default: "",
        },
        /** Accessible name of the button row. */
        ariaLabel: {
            type: String,
            default: "",
        },
        /** `md` matches the project header; `sm` is denser for service cards. */
        size: {
            type: String,
            default: "md",
            validator: value => [ "md", "sm" ].includes(value),
        },
    },
    emits: [ "select" ],
    data() {
        return {
            // Optimistic until the first measurement, avoids a flash of an empty row
            fitCount: this.maxVisible,
        };
    },
    computed: {
        allActions() {
            return this.actions.filter(action => !action.hidden);
        },
        candidates() {
            return this.allActions.filter(action => !action.menuOnly);
        },
        pinnedActions() {
            return this.allActions.filter(action => action.menuOnly);
        },
        visibleActions() {
            return this.candidates.slice(0, this.fitCount);
        },
        menuActions() {
            return [
                ...this.candidates.slice(this.fitCount),
                ...this.pinnedActions,
            ];
        },
        menuPanelClass() {
            return this.size === "sm" ? "action-group-menu is-sm" : "action-group-menu";
        },
    },
    watch: {
        candidates() {
            this.$nextTick(() => this.updateFit());
        },
        pinnedActions() {
            this.$nextTick(() => this.updateFit());
        },
        maxVisible() {
            this.$nextTick(() => this.updateFit());
        },
        "$i18n.locale"() {
            this.$nextTick(() => this.updateFit());
        },
    },
    mounted() {
        this.updateFit();

        this.resizeObserver = new ResizeObserver(() => this.updateFit());
        this.resizeObserver.observe(this.$refs.root);

        // Web fonts change the width of the labels
        document.fonts?.ready?.then(() => this.updateFit());
    },
    beforeUnmount() {
        this.resizeObserver?.disconnect();
    },
    methods: {
        /**
         * Decide how many actions fit into the available width.
         * @returns {void}
         */
        updateFit() {
            const root = this.$refs.root;
            const measure = this.$refs.measure;
            if (!root || !measure || !this.candidates.length) {
                this.fitCount = 0;
                return;
            }

            const available = root.clientWidth;
            if (!available) {
                return;
            }

            // The last clone is the ellipsis trigger
            const widths = [ ...measure.children ].map(el => el.getBoundingClientRect().width);
            const ellipsisWidth = widths.pop();

            let count = 0;
            for (let n = Math.min(this.maxVisible, widths.length); n >= 0; n--) {
                const needsMenu = n < widths.length || this.pinnedActions.length > 0;
                const used = widths.slice(0, n).reduce((sum, w) => sum + w, 0)
                    + (needsMenu ? ellipsisWidth : 0);

                if (used <= available) {
                    count = n;
                    break;
                }
            }

            if (count !== this.fitCount) {
                this.fitCount = count;
            }
        },

        select(action) {
            if (this.isDisabled(action)) {
                return;
            }
            this.$emit("select", action.key);
        },

        buttonClass(action) {
            const iconOnly = { "action-group-icon-only": !this.labelFor(action) };
            if (this.isDanger(action)) {
                return [ "btn-normal", "text-danger", iconOnly ];
            }
            if (this.isWarning(action)) {
                return [ "btn-normal", "text-warning", iconOnly ];
            }
            return [
                action.variant || "btn-normal",
                iconOnly,
            ];
        },

        isDanger(action) {
            return Boolean(action.danger) || action.variant === "btn-danger";
        },

        isWarning(action) {
            return Boolean(action.warning) || action.variant === "btn-warning";
        },

        isDisabled(action) {
            return this.disabled || Boolean(action.disabled);
        },

        titleFor(action) {
            return action.title ?? this.labelFor(action) ?? "";
        },

        labelFor(action) {
            if (action.label) {
                return action.label;
            }
            return action.i18nKey ? this.$t(action.i18nKey) : "";
        },
    },
};
</script>

<style lang="scss">
@import "../styles/vars.scss";

.action-group {
    position: relative;
    display: inline-flex;
    overflow: hidden;
    flex-wrap: nowrap;
    align-items: stretch;
    min-width: 0;
    > .btn:first-of-type {
        border-start-start-radius: var(--bs-btn-border-radius, 0.375rem);
        border-end-start-radius: var(--bs-btn-border-radius, 0.375rem);
    }

    > .btn:last-of-type {
        border-start-end-radius: var(--bs-btn-border-radius, 0.375rem);
        border-end-end-radius: var(--bs-btn-border-radius, 0.375rem);
    }

    .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.4rem;
        min-height: 38px;
        padding: 0.5rem 0.75rem;
        border: 0;
        border-radius: 0;
        box-shadow: none;
        white-space: nowrap;
        line-height: 1;

        svg {
            display: block;
            flex: 0 0 1em;
            width: 1em;
            height: 1em;
            margin: 0 !important;
        }

        &:focus-visible {
            outline: 2px solid $primary;
            outline-offset: -2px;
        }

        &.text-danger {
            color: $danger;
        }

        &.text-warning {
            color: $warning;
        }
    }

    .floating-menu {
        display: inline-flex;
    }

    .btn-icon {
        width: 38px;
        padding: 0;
    }
}

.action-group-menu {
    min-width: 10rem;
    padding: 0;
    border-radius: var(--bs-btn-border-radius, 0.375rem);
    overflow: hidden;

    .floating-menu-item {
        display: flex;
        width: 100%;
        align-items: center;
        justify-content: flex-start;
        gap: 0.4rem;
        min-height: 38px;
        padding: 0.5rem 0.75rem;
        border: 0;
        border-radius: 0;
        background: transparent;
        color: inherit;
        font-family: inherit;
        font-size: 1rem;
        font-weight: 400;
        line-height: 1;
        text-align: start;
        white-space: nowrap;

        svg {
            display: block;
            flex: 0 0 1em;
            width: 1em;
            height: 1em;
            margin: 0;
        }

        &:hover:not(:disabled),
        &:focus-visible {
            background-color: darken(#F5F5F5, 3%);
            outline: none;
        }

        &.text-danger {
            color: $danger;
        }

        &.text-warning {
            color: $warning;
        }
    }

    .floating-menu-divider {
        margin: 0;
    }

    .dark & {
        background-color: $dark-header-bg;

        .floating-menu-item:hover:not(:disabled),
        .floating-menu-item:focus-visible {
            background-color: darken($dark-header-bg, 3%);
        }
    }
}

.action-group .btn {
    font-family: inherit;
    font-size: 1rem;
    font-weight: 400;
}

.action-group-measure {
    position: absolute;
    top: 0;
    left: 0;
    display: flex;
    width: max-content;
    flex-wrap: nowrap;
    visibility: hidden;
    pointer-events: none;
}

@media (max-width: 991.98px) {
    .action-group:not(.is-sm) .btn {
        min-height: 44px;
    }

    .action-group:not(.is-sm) .btn-icon {
        width: 44px;
    }
}

.action-group.is-sm {
    .btn {
        min-height: 28px;
        padding: 0.2rem 0.65rem;
        font-size: 0.8rem;
        gap: 0.35rem;
    }

    .btn-icon {
        width: 28px;
        padding: 0;
    }
}

.action-group-menu.is-sm .floating-menu-item {
    min-height: 28px;
    padding: 0.2rem 0.65rem;
    font-size: 0.8rem;
    gap: 0.35rem;
}
</style>
