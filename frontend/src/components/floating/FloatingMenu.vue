<template>
    <slot
        name="trigger"
        :trigger-ref="setTriggerRef"
        :trigger-attrs="triggerAttrs"
        :is-open="isOpen"
        :open="open"
        :close="close"
        :toggle="toggle"
    />

    <Teleport to="body">
        <Transition :name="transitionName">
            <div
                v-if="isOpen"
                ref="floatingEl"
                class="floating-menu-panel"
                :class="panelClass"
                :style="panelStyle"
                role="menu"
                tabindex="-1"
                @keydown="onPanelKeydown"
                @click="onPanelClick"
            >
                <slot :close="close" :open="open" />
            </div>
        </Transition>
    </Teleport>
</template>

<script>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import {
    autoUpdate,
    flip,
    limitShift,
    offset as offsetMiddleware,
    shift,
    size,
    useFloating,
} from "@floating-ui/vue";

const ITEM_SELECTOR = "[role='menuitem'], .floating-menu-item, button, a[href]";

export default {
    name: "FloatingMenu",
    inheritAttrs: false,
    props: {
        /** Any Floating UI placement, e.g. `bottom-end`, `top-start`, `right`. */
        placement: {
            type: String,
            default: "bottom-end",
        },
        /** Distance between the trigger and the panel, in pixels. */
        offset: {
            type: Number,
            default: 6,
        },
        disabled: {
            type: Boolean,
            default: false,
        },
        /** Close the menu when any interactive item inside the panel is clicked. */
        closeOnClick: {
            type: Boolean,
            default: true,
        },
        /** Match the panel width to the trigger width. */
        matchTriggerWidth: {
            type: Boolean,
            default: false,
        },
        /** Extra class applied to the floating panel (which lives outside of the component root). */
        panelClass: {
            type: String,
            default: "",
        },
    },
    emits: [ "open", "close" ],
    setup(props, { emit, attrs }) {
        const referenceEl = ref(null);
        const floatingEl = ref(null);
        const isOpen = ref(false);

        /**
         * Register the consumer-provided trigger element as the floating reference.
         * @param {HTMLElement|null} el Trigger element rendered by the slot.
         * @returns {void}
         */
        function setTriggerRef(el) {
            referenceEl.value = el;
        }

        const middleware = computed(() => [
            offsetMiddleware(props.offset),
            flip({ padding: 8 }),
            shift({ padding: 8,
                limiter: limitShift() }),
            size({
                padding: 8,
                apply({ availableWidth,
                    availableHeight,
                    rects,
                    elements }) {
                    elements.floating.style.setProperty("--floating-max-width", `${Math.max(140, Math.round(availableWidth))}px`);
                    elements.floating.style.setProperty("--floating-max-height", `${Math.max(120, Math.round(availableHeight))}px`);
                    if (props.matchTriggerWidth) {
                        elements.floating.style.setProperty("--floating-min-width", `${Math.round(rects.reference.width)}px`);
                    }
                },
            }),
        ]);

        const { floatingStyles, placement: resolvedPlacement, update } = useFloating(referenceEl, floatingEl, {
            placement: computed(() => props.placement),
            strategy: "fixed",
            middleware,
            whileElementsMounted: autoUpdate,
        });

        const panelStyle = computed(() => {
            const origin = {
                top: resolvedPlacement.value.startsWith("top") ? "bottom" : "top",
                inline: resolvedPlacement.value.endsWith("end") ? "right" : resolvedPlacement.value.endsWith("start") ? "left" : "center",
            };
            return {
                ...floatingStyles.value,
                transformOrigin: `${origin.inline} ${origin.top}`,
            };
        });

        const transitionName = ref("floating-menu");

        /**
         * Attributes the consumer is expected to spread onto the trigger element.
         * Keeping the trigger as the consumer's own element avoids wrapping it in an
         * extra node, which matters for segmented button groups and grid layouts.
         */
        const triggerAttrs = computed(() => {
            const { class: attrsClass, ...rest } = attrs;
            return {
                ...rest,
                ref: setTriggerRef,
                class: [ "floating-menu", attrsClass, {
                    "is-open": isOpen.value,
                    "is-disabled": props.disabled,
                }],
                "aria-expanded": isOpen.value ? "true" : "false",
                "aria-haspopup": "menu",
                onClick: onReferenceClick,
                onKeydown: onReferenceKeydown,
            };
        });

        /**
         * All focusable menu items currently rendered inside the panel.
         * @returns {Array} List of focusable elements.
         */
        function items() {
            if (!floatingEl.value) {
                return [];
            }
            return [ ...floatingEl.value.querySelectorAll(ITEM_SELECTOR) ]
                .filter(el => !el.disabled && el.getAttribute("aria-disabled") !== "true" && el.offsetParent !== null);
        }

        /**
         * Move the focus to the menu item at the given index.
         * @param {number} index Item index, negative values count from the end.
         * @returns {void}
         */
        function focusItem(index) {
            const list = items();
            if (list.length === 0) {
                floatingEl.value?.focus();
                return;
            }
            const target = index < 0 ? list.length + index : index;
            list[Math.min(Math.max(target, 0), list.length - 1)]?.focus();
        }

        /**
         * Show the menu and position it next to the trigger.
         * @returns {void}
         */
        function open() {
            if (props.disabled || isOpen.value) {
                return;
            }
            isOpen.value = true;
            emit("open");
            nextTick(() => update());
        }

        /**
         * Hide the menu.
         * @param {boolean} restoreFocus Put the focus back onto the trigger.
         * @returns {void}
         */
        function close(restoreFocus = false) {
            if (!isOpen.value) {
                return;
            }
            isOpen.value = false;
            emit("close");
            if (restoreFocus) {
                referenceEl.value?.focus();
            }
        }

        /**
         * Toggle the menu visibility.
         * @returns {void}
         */
        function toggle() {
            if (isOpen.value) {
                close(true);
            } else {
                open();
            }
        }

        function onReferenceClick(event) {
            if (props.disabled) {
                return;
            }
            // The panel lives in a teleport and never bubbles through the trigger
            if (floatingEl.value?.contains(event.target)) {
                return;
            }
            toggle();
        }

        function onReferenceKeydown(event) {
            if (props.disabled) {
                return;
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                open();
                nextTick(() => focusItem(event.key === "ArrowDown" ? 0 : -1));
            } else if (event.key === "Escape" && isOpen.value) {
                event.preventDefault();
                close(true);
            }
        }

        function onPanelKeydown(event) {
            const list = items();

            switch (event.key) {
                case "Escape":
                    event.preventDefault();
                    event.stopPropagation();
                    close(true);
                    break;
                case "Tab":
                    close(false);
                    break;
                case "ArrowDown":
                case "ArrowUp": {
                    event.preventDefault();
                    const current = list.indexOf(document.activeElement);
                    const step = event.key === "ArrowDown" ? 1 : -1;
                    if (current === -1) {
                        focusItem(step === 1 ? 0 : -1);
                    } else {
                        focusItem((current + step + list.length) % list.length);
                    }
                    break;
                }
                case "Home":
                    event.preventDefault();
                    focusItem(0);
                    break;
                case "End":
                    event.preventDefault();
                    focusItem(-1);
                    break;
                default:
                    break;
            }
        }

        function onPanelClick(event) {
            if (props.closeOnClick && event.target.closest(ITEM_SELECTOR)) {
                close(false);
            }
        }

        function onDocumentPointerDown(event) {
            if (referenceEl.value?.contains(event.target) || floatingEl.value?.contains(event.target)) {
                return;
            }
            close(false);
        }

        function onDocumentKeydown(event) {
            if (event.key === "Escape") {
                close(true);
            }
        }

        watch(isOpen, value => {
            if (value) {
                document.addEventListener("pointerdown", onDocumentPointerDown, true);
                document.addEventListener("keydown", onDocumentKeydown);
            } else {
                document.removeEventListener("pointerdown", onDocumentPointerDown, true);
                document.removeEventListener("keydown", onDocumentKeydown);
            }
        });

        onBeforeUnmount(() => {
            document.removeEventListener("pointerdown", onDocumentPointerDown, true);
            document.removeEventListener("keydown", onDocumentKeydown);
        });

        return {
            referenceEl,
            floatingEl,
            isOpen,
            panelStyle,
            transitionName,
            triggerAttrs,
            setTriggerRef,
            open,
            close,
            toggle,
            onReferenceClick,
            onReferenceKeydown,
            onPanelKeydown,
            onPanelClick,
        };
    },
};
</script>

<style lang="scss">
@import "../../styles/vars.scss";

.floating-menu {
    &.is-disabled {
        pointer-events: none;
        opacity: 0.6;
    }
}

.floating-menu-panel {
    position: fixed;
    z-index: 1080;
    overflow: auto;
    width: max-content;
    min-width: var(--floating-min-width, 10rem);
    max-width: var(--floating-max-width, calc(100vw - 16px));
    max-height: var(--floating-max-height, calc(100vh - 16px));
    padding: 0.35rem;
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 12px;
    background-color: #fff;
    color: #111;
    box-shadow: 0 15px 45px rgba(0, 0, 0, 0.18);
    overscroll-behavior: contain;
    outline: none;

    .dark & {
        border-color: $dark-border-color;
        background-color: $dark-header-bg;
        color: $dark-font-color;
    }
}

.floating-menu-item {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border: 0;
    border-radius: 8px;
    color: inherit;
    font-size: 0.9rem;
    background: transparent;
    text-align: start;
    text-decoration: none;

    &:hover,
    &:focus-visible {
        background-color: rgba(0, 0, 0, 0.06);
        outline: none;
    }

    &.active {
        background-color: rgba($primary, 0.25);
    }

    &.text-danger {
        color: $danger;
    }

    &.text-warning {
        color: $warning;
    }

    svg {
        width: 0.9em;
        flex: 0 0 auto;
    }

    .dark & {

        &:hover,
        &:focus-visible {
            background-color: rgba(255, 255, 255, 0.08);
        }
    }
}

.floating-menu-divider {
    height: 1px;
    margin: 0.35rem 0.25rem;
    background-color: rgba(0, 0, 0, 0.1);

    .dark & {
        background-color: $dark-border-color;
    }
}

.floating-menu-text {
    display: block;
    padding: 0.35rem 0.75rem;
    font-size: 0.85rem;
    opacity: 0.75;
}

.floating-menu-enter-active {
    transition: opacity 0.14s ease, scale 0.14s ease;
}

.floating-menu-leave-active {
    transition: opacity 0.1s ease, scale 0.1s ease;
}

.floating-menu-enter-from,
.floating-menu-leave-to {
    opacity: 0;
    scale: 0.96;
}
</style>
