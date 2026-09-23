<template>
    <transition name="slide-fade" appear>
        <div class="stack-browser">
            <div class="stack-browser-heading d-flex align-items-center gap-3 mb-3">
                <h1 class="mb-0">{{ $t("stacks") }}</h1>
                <router-link to="/compose" class="btn btn-primary btn-sm add-stack" :aria-label="$t('compose')" :title="$t('compose')">
                    <font-awesome-icon icon="plus" />
                </router-link>
            </div>
            <StackList :scrollbar="true" />
        </div>
    </transition>
</template>

<script>
import StackList from "../components/StackList.vue";

export default {
    components: { StackList },
};
</script>

<style scoped lang="scss">
.stack-browser {
    display: flex;
    flex-direction: column;
    flex: 1 1 0;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
}

.stack-browser-heading {
    flex: 0 0 auto;
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

.stack-browser :deep(.stack-list-box) {
    flex: 1 1 0;
    position: static;
    width: 100%;
    height: auto;
    max-height: none;
    min-height: 0;
    margin-bottom: 0;
}
</style>
