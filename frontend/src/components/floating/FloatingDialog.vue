<template>
    <Teleport to="body">
        <Transition name="floating-dialog" @after-leave="onAfterLeave">
            <div
                v-if="modelValue"
                class="floating-dialog-backdrop"
                role="presentation"
                @pointerdown.self="onBackdropPointerdown"
            >
                <div
                    ref="floatingEl"
                    class="floating-dialog"
                    :class="[ `size-${size}`, dialogClass, { 'is-fill': fill, 'is-busy': busy } ]"
                    :style="dialogStyle"
                    role="dialog"
                    aria-modal="true"
                    :aria-label="title"
                    tabindex="-1"
                    @keydown="onDialogKeydown"
                >
                    <header v-if="hasHeader" class="fd-header">
                        <slot name="header">
                            <h5 class="fd-title">{{ title }}</h5>
                        </slot>
                        <button v-if="!hideClose" type="button" class="fd-close" :aria-label="$t('close')" @click="cancel">
                            <font-awesome-icon icon="times" />
                        </button>
                    </header>

                    <div class="fd-body">
                        <slot />
                    </div>

                    <footer v-if="!hideFooter" class="fd-footer">
                        <slot name="footer" :cancel="cancel" :ok="ok" :busy="busy">
                            <button type="button" class="btn" :class="cancelVariant" :disabled="busy" @click="cancel">
                                {{ cancelTitle || $t("cancel") }}
                            </button>
                            <button type="button" class="btn" :class="okVariant" :disabled="okDisabled || busy" @click="ok">
                                <span v-if="busy" class="spinner-border spinner-border-sm me-1" />
                                {{ okTitle || $t("ok") }}
                            </button>
                        </slot>
                    </footer>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script>
import { computed, nextTick, onBeforeUnmount, ref, useSlots, watch } from "vue";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { offset, shift, size as sizeMiddleware, useFloating } from "@floating-ui/vue";

const FOCUSABLE_SELECTOR = "a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";
const VIEWPORT_PADDING = 16;

let openDialogCount = 0;
/** @type {{ cancel: () => void, noCloseOnEsc: boolean }[]} */
const openDialogStack = [];

/**
 * Escape is handled on document (capture) so it still works when focus is inside
 * widgets that swallow keys (e.g. xterm).
 * @param {KeyboardEvent} event
 * @returns {void}
 */
function onDocumentEscape(event) {
    if (event.key !== "Escape") {
        return;
    }
    const top = openDialogStack[openDialogStack.length - 1];
    if (!top || top.noCloseOnEsc) {
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    top.cancel();
}

document.addEventListener("keydown", onDocumentEscape, true);

/**
 * A dialog anchored with Floating UI to the center of the viewport.
 *
 * The virtual reference is a zero-sized point in the middle of the screen, so the
 * `size` middleware reports exactly how much room is left around it. That keeps the
 * dialog inside the viewport on every screen size without any hardcoded heights.
 */
export default {
    name: "FloatingDialog",
    components: {
        FontAwesomeIcon,
    },
    props: {
        modelValue: {
            type: Boolean,
            default: false,
        },
        title: {
            type: String,
            default: "",
        },
        okTitle: {
            type: String,
            default: "",
        },
        cancelTitle: {
            type: String,
            default: "",
        },
        okVariant: {
            type: String,
            default: "btn-primary",
        },
        cancelVariant: {
            type: String,
            default: "btn-normal",
        },
        /** `sm`, `md`, `lg`, `xl` or `full`. */
        size: {
            type: String,
            default: "md",
        },
        /** Let the dialog grow to the full available viewport height. */
        fill: {
            type: Boolean,
            default: false,
        },
        hideFooter: {
            type: Boolean,
            default: false,
        },
        hideClose: {
            type: Boolean,
            default: false,
        },
        /** Hide the whole header bar (title still used for aria-label when set). */
        hideHeader: {
            type: Boolean,
            default: false,
        },
        noCloseOnBackdrop: {
            type: Boolean,
            default: false,
        },
        noCloseOnEsc: {
            type: Boolean,
            default: false,
        },
        okDisabled: {
            type: Boolean,
            default: false,
        },
        busy: {
            type: Boolean,
            default: false,
        },
        /** Extra class applied to the dialog panel itself. */
        dialogClass: {
            type: String,
            default: "",
        },
    },
    emits: [ "update:modelValue", "ok", "cancel", "shown", "hidden" ],
    setup(props, { emit }) {
        const slots = useSlots();
        const floatingEl = ref(null);
        const isPositioned = ref(false);
        let previouslyFocused = null;

        const virtualReference = computed(() => ({
            getBoundingClientRect() {
                const x = window.innerWidth / 2;
                const y = window.innerHeight / 2;
                return {
                    x,
                    y,
                    width: 0,
                    height: 0,
                    top: y,
                    right: x,
                    bottom: y,
                    left: x,
                };
            },
        }));

        const middleware = computed(() => [
            offset(({ rects }) => ({ mainAxis: -rects.floating.height / 2 })),
            shift({ padding: VIEWPORT_PADDING }),
            sizeMiddleware({
                padding: VIEWPORT_PADDING,
                apply({ availableWidth, availableHeight, elements }) {
                    elements.floating.style.setProperty("--fd-max-width", `${Math.round(availableWidth)}px`);
                    elements.floating.style.setProperty("--fd-max-height", `${Math.round(availableHeight)}px`);
                },
            }),
        ]);

        const { floatingStyles, isPositioned: positioned } = useFloating(virtualReference, floatingEl, {
            placement: "bottom",
            strategy: "fixed",
            middleware,
        });

        watch(positioned, value => {
            isPositioned.value = value;
        });

        const dialogStyle = computed(() => {
            if (!isPositioned.value) {
                return {
                    position: "fixed",
                    left: "50%",
                    top: "50%",
                    transform: "translate(-50%, -50%)",
                    visibility: "hidden",
                };
            }
            return floatingStyles.value;
        });

        const hasHeader = computed(() => !props.hideHeader && (Boolean(props.title) || Boolean(slots.header)));

        /**
         * All currently focusable elements of the dialog.
         * @returns {Array} List of focusable elements.
         */
        function focusables() {
            if (!floatingEl.value) {
                return [];
            }
            return [ ...floatingEl.value.querySelectorAll(FOCUSABLE_SELECTOR) ]
                .filter(el => el.offsetParent !== null);
        }

        /**
         * Move the initial focus into the dialog once it is rendered.
         * @returns {void}
         */
        function focusDialog() {
            const list = focusables();
            const autofocus = floatingEl.value?.querySelector("[autofocus], .fd-body input, .fd-body textarea, .fd-body select");
            (autofocus || list[0] || floatingEl.value)?.focus();
        }

        function lockScroll() {
            openDialogCount += 1;
            if (openDialogCount === 1) {
                document.body.classList.add("floating-dialog-open");
            }
        }

        function unlockScroll() {
            openDialogCount = Math.max(0, openDialogCount - 1);
            if (openDialogCount === 0) {
                document.body.classList.remove("floating-dialog-open");
            }
        }

        /**
         * Ask the parent to close the dialog.
         * @returns {void}
         */
        function requestClose() {
            emit("update:modelValue", false);
        }

        /**
         * Accept the dialog.
         * @returns {void}
         */
        function ok() {
            if (props.okDisabled || props.busy) {
                return;
            }
            emit("ok");
        }

        /**
         * Dismiss the dialog.
         * @returns {void}
         */
        function cancel() {
            emit("cancel");
            requestClose();
        }

        function onBackdropPointerdown() {
            if (props.noCloseOnBackdrop || props.busy) {
                return;
            }
            requestClose();
        }

        function onDialogKeydown(event) {
            if (event.key !== "Tab") {
                return;
            }

            const list = focusables();
            if (list.length === 0) {
                event.preventDefault();
                return;
            }

            const first = list[0];
            const last = list[list.length - 1];

            if (event.shiftKey && (document.activeElement === first || document.activeElement === floatingEl.value)) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }

        function onAfterLeave() {
            unlockScroll();
            emit("hidden");
            previouslyFocused?.focus?.();
            previouslyFocused = null;
        }

        watch(() => props.modelValue, async value => {
            if (value) {
                previouslyFocused = document.activeElement;
                lockScroll();
                openDialogStack.push({
                    cancel,
                    get noCloseOnEsc() {
                        return props.noCloseOnEsc;
                    },
                });
                await nextTick();
                focusDialog();
                emit("shown");
            } else {
                const index = openDialogStack.findIndex((entry) => entry.cancel === cancel);
                if (index >= 0) {
                    openDialogStack.splice(index, 1);
                }
            }
        });

        onBeforeUnmount(() => {
            const index = openDialogStack.findIndex((entry) => entry.cancel === cancel);
            if (index >= 0) {
                openDialogStack.splice(index, 1);
            }
            if (props.modelValue) {
                unlockScroll();
            }
        });

        return {
            floatingEl,
            dialogStyle,
            hasHeader,
            ok,
            cancel,
            onBackdropPointerdown,
            onDialogKeydown,
            onAfterLeave,
        };
    },
};
</script>

<style lang="scss">
@import "../../styles/vars.scss";

body.floating-dialog-open {
    overflow: hidden;
}

.floating-dialog-backdrop {
    position: fixed;
    z-index: 1090;
    background-color: rgba(0, 0, 0, 0.5);
    inset: 0;
}

.floating-dialog {
    display: flex;
    overflow: hidden;
    flex-direction: column;
    width: min(var(--fd-width, 520px), var(--fd-max-width, calc(100vw - 32px)));
    max-height: var(--fd-max-height, calc(100vh - 32px));
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 12px;
    background-color: #fff;
    color: #111;
    box-shadow: 0 25px 70px rgba(0, 0, 0, 0.25);
    outline: none;

    &.size-sm {
        --fd-width: 400px;
    }

    &.size-lg {
        --fd-width: 760px;
    }

    &.size-xl {
        --fd-width: 1040px;
    }

    &.size-full {
        --fd-width: 100vw;
        border-radius: 0;
    }

    &.is-fill {
        height: var(--fd-max-height, calc(100vh - 32px));
    }

    &.size-full.is-fill {
        height: 100dvh;
        max-height: 100dvh;
    }

    .dark & {
        border-color: $dark-border-color;
        background-color: $dark-bg;
        color: $dark-font-color;
    }
}

.fd-header {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1.15rem 1.15rem 0;
}

.fd-title {
    overflow: hidden;
    margin: 0;
    font-size: 1.05rem;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.fd-close {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 0;
    border-radius: 8px;
    color: inherit;
    background: transparent;
    opacity: 0.7;

    &:hover,
    &:focus-visible {
        background-color: rgba(0, 0, 0, 0.08);
        opacity: 1;
        outline: none;
    }

    .dark & {

        &:hover,
        &:focus-visible {
            background-color: rgba(255, 255, 255, 0.1);
        }
    }
}

.fd-body {
    overflow: auto;
    flex: 1 1 auto;
    min-height: 0;
    padding: 0.9rem 1.15rem 1.15rem;
    overscroll-behavior: contain;
}

.fd-footer {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0 1.15rem 1.15rem;
}

.floating-dialog-enter-active {
    transition: opacity 0.16s ease;
}

.floating-dialog-leave-active {
    transition: opacity 0.14s ease;
}

.floating-dialog-enter-active .floating-dialog {
    transition: scale 0.16s ease, opacity 0.16s ease;
}

.floating-dialog-leave-active .floating-dialog {
    transition: scale 0.14s ease, opacity 0.14s ease;
}

.floating-dialog-enter-from,
.floating-dialog-leave-to {
    opacity: 0;
}

.floating-dialog-enter-from .floating-dialog {
    opacity: 0;
    scale: 0.96;
}

.floating-dialog-leave-to .floating-dialog {
    opacity: 0;
    scale: 0.98;
}
</style>
