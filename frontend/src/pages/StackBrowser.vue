<template>
    <transition name="slide-fade" appear>
        <div class="stack-browser">
            <div class="d-flex align-items-center gap-3 mb-3">
                <h1 class="mb-0">{{ $t("stacks") }}</h1>
                <router-link to="/compose" class="btn btn-primary btn-sm add-stack" :aria-label="$t('compose')" :title="$t('compose')">
                    <font-awesome-icon icon="plus" />
                </router-link>
            </div>
            <StackList />
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

.stack-browser :deep(.shadow-box) {
    position: static;
    height: auto;
    min-height: calc(100dvh - 190px);
}
</style>
