<template>
    <FloatingDialog
        v-model="visible"
        size="sm"
        :title="title || $t('Confirm')"
        :ok-title="yesText"
        :cancel-title="noText"
        :ok-variant="btnStyle"
        cancel-variant="btn-secondary"
        @ok="yes"
        @cancel="no"
    >
        <slot />
    </FloatingDialog>
</template>

<script>
import FloatingDialog from "./floating/FloatingDialog.vue";

export default {
    components: {
        FloatingDialog,
    },
    props: {
        /** Style of button */
        btnStyle: {
            type: String,
            default: "btn-primary",
        },
        /** Text to use as yes */
        yesText: {
            type: String,
            default: "Yes",     // TODO: No idea what to translate this
        },
        /** Text to use as no */
        noText: {
            type: String,
            default: "No",
        },
        /** Title to show on modal. Defaults to translated version of "Confirm" */
        title: {
            type: String,
            default: null,
        },
    },
    emits: [ "yes", "no" ],
    data() {
        return {
            visible: false,
        };
    },
    methods: {
        /**
         * Show the confirm dialog
         * @returns {void}
         */
        show() {
            this.visible = true;
        },
        /**
         * Notify the parent when Yes is pressed
         * @fires string "yes"
         * @returns {void}
         */
        yes() {
            this.visible = false;
            this.$emit("yes");
        },
        /**
         * Notify the parent when No is pressed
         * @fires string "no"
         * @returns {void}
         */
        no() {
            this.visible = false;
            this.$emit("no");
        },
    },
};
</script>
