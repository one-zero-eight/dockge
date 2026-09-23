<template>
    <div class="app-layout" :class="classes">
        <div v-if="! $root.socketIO.connected && ! $root.socketIO.firstConnect" class="lost-connection">
            <div class="container-fluid">
                {{ $root.socketIO.connectionErrorMsg }}
                <div v-if="$root.socketIO.showReverseProxyGuide">
                    {{ $t("reverseProxyMsg1") }} <a href="https://github.com/louislam/uptime-kuma/wiki/Reverse-Proxy" target="_blank">{{ $t("reverseProxyMsg2") }}</a>
                </div>
            </div>
        </div>

        <!-- Desktop header -->
        <header v-if="!$root.isCompact" class="desktop-header d-flex flex-wrap justify-content-center py-3 border-bottom">
            <router-link to="/" class="d-flex align-items-center mb-md-0 me-md-auto text-dark text-decoration-none">
                <object class="bi me-2 ms-4" width="40" height="40" data="/icon.svg" />
                <span class="fs-4 title">Dockge</span>
            </router-link>

            <a v-if="hasNewVersion" target="_blank" href="https://github.com/louislam/dockge/releases" class="btn btn-warning me-3">
                <font-awesome-icon icon="arrow-alt-circle-up" /> {{ $t("newUpdate") }}
            </a>

            <ul class="nav nav-pills">
                <li v-if="$root.loggedIn" class="nav-item me-2">
                    <router-link to="/" class="nav-link">
                        <font-awesome-icon icon="home" /> {{ $t("home") }}
                    </router-link>
                </li>

                <li v-if="$root.loggedIn" class="nav-item me-2">
                    <router-link to="/console" class="nav-link">
                        <font-awesome-icon icon="terminal" /> {{ $t("console") }}
                    </router-link>
                </li>

                <li v-if="$root.loggedIn" class="nav-item me-2">
                    <router-link to="/files" class="nav-link">
                        <font-awesome-icon icon="folder-open" /> {{ $t("files") }}
                    </router-link>
                </li>

                <li v-if="$root.loggedIn" class="nav-item">
                    <FloatingMenu placement="bottom-end" panel-class="profile-menu">
                        <template #trigger="{ triggerAttrs }">
                            <div v-bind="triggerAttrs" class="nav-link dropdown-profile-pic" role="button" tabindex="0">
                                <div class="profile-pic">{{ $root.usernameFirstChar }}</div>
                                <font-awesome-icon icon="angle-down" />
                            </div>
                        </template>

                        <!-- Header's Dropdown Menu -->
                        <div class="dropdown-item-text">
                            <i18n-t v-if="$root.username != null" tag="span" keypath="signedInDisp">
                                <strong>{{ $root.username }}</strong>
                            </i18n-t>
                            <span v-if="$root.username == null">{{ $t("signedInDispDisabled") }}</span>
                        </div>

                        <div class="floating-menu-divider" />

                        <button class="floating-menu-item" type="button" role="menuitem" @click="scanFolder">
                            <font-awesome-icon icon="arrows-rotate" /> {{ $t("scanFolder") }}
                        </button>

                        <router-link to="/settings/general" class="floating-menu-item" role="menuitem" :class="{ active: $route.path.includes('settings') }">
                            <font-awesome-icon icon="cog" /> {{ $t("Settings") }}
                        </router-link>

                        <button class="floating-menu-item" type="button" role="menuitem" @click="$root.logout">
                            <font-awesome-icon icon="sign-out-alt" />
                            {{ $t("Logout") }}
                        </button>
                    </FloatingMenu>
                </li>
            </ul>
        </header>

        <main>
            <div v-if="$root.socketIO.connecting" class="container mt-5">
                <h4>{{ $t("connecting...") }}</h4>
            </div>

            <router-view v-if="$root.loggedIn" />
            <Login v-if="! $root.loggedIn && $root.allowLoginDialog" />
        </main>

        <nav v-if="$root.isCompact && $root.loggedIn" class="bottom-nav" :aria-label="$t('mainNavigation')">
            <router-link to="/" exact-active-class="active"><font-awesome-icon icon="home" /><span>{{ $t("home") }}</span></router-link>
            <router-link to="/stacks"><font-awesome-icon icon="stream" /><span>{{ $t("stacks") }}</span></router-link>
            <router-link to="/console"><font-awesome-icon icon="terminal" /><span>{{ $t("console") }}</span></router-link>
            <router-link to="/files"><font-awesome-icon icon="folder-open" /><span>{{ $t("files") }}</span></router-link>
            <router-link to="/settings"><font-awesome-icon icon="cog" /><span>{{ $t("Settings") }}</span></router-link>
        </nav>
    </div>
</template>

<script>
import Login from "../components/Login.vue";
import { FloatingMenu } from "../components/floating";
import { compareVersions } from "compare-versions";
import { ALL_ENDPOINTS } from "../../../common/util-common";

export default {

    components: {
        Login,
        FloatingMenu,
    },

    data() {
        return {

        };
    },

    computed: {

        // Theme or Mobile
        classes() {
            const classes = {};
            classes[this.$root.theme] = true;
            classes["mobile"] = this.$root.isMobile;
            return classes;
        },

        hasNewVersion() {
            if (this.$root.info.latestVersion && this.$root.info.version) {
                return compareVersions(this.$root.info.latestVersion, this.$root.info.version) >= 1;
            } else {
                return false;
            }
        },

    },

    watch: {

    },

    mounted() {

    },

    beforeUnmount() {

    },

    methods: {
        scanFolder() {
            this.$root.emitAgent(ALL_ENDPOINTS, "requestStackList", (res) => {
                this.$root.toastRes(res);
            });
        },
    },

};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

.nav-link {
    &.status-page {
        background-color: rgba(255, 255, 255, 0.1);
    }
}

.bottom-nav {
    z-index: 1000;
    position: fixed;
    bottom: 0;
    height: calc(60px + env(safe-area-inset-bottom));
    width: 100%;
    left: 0;
    background-color: #fff;
    box-shadow: 0 15px 47px 0 rgba(0, 0, 0, 0.05), 0 5px 14px 0 rgba(0, 0, 0, 0.05);
    text-align: center;
    white-space: nowrap;
    padding: 0 10px env(safe-area-inset-bottom);

    display: flex;

    a {
        text-align: center;
        width: 20%;
        display: flex;
        flex-direction: column;
        align-items: center;
        height: 100%;
        padding: 8px 10px 0;
        font-size: 13px;
        color: #c1c1c1;
        overflow: hidden;
        text-decoration: none;

        &.router-link-exact-active, &.active {
            color: $primary;
            font-weight: bold;
        }

        svg {
            font-size: 20px;
        }

        span {
            margin-top: 2px;
            overflow: hidden;
            max-width: 100%;
            text-overflow: ellipsis;
        }
    }
}

.mobile main {
    padding-bottom: calc(76px + env(safe-area-inset-bottom));
}

.desktop-header {
    margin-bottom: 0;
}

.title {
    font-weight: bold;
}

.nav {
    margin-right: 25px;
}

.lost-connection {
    padding: 5px;
    background-color: crimson;
    color: white;
    position: fixed;
    width: 100%;
    z-index: 99999;
}

// Profile Pic Button with Dropdown
.nav-link.dropdown-profile-pic {
    cursor: pointer;
    display: flex;
    gap: 6px;
    align-items: center;
    background-color: rgba(200, 200, 200, 0.2);
    padding: 0.5rem 0.8rem;
    user-select: none;

    &:hover {
        background-color: rgba(255, 255, 255, 0.2);
    }

    .profile-pic {
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        background-color: $primary;
        width: 24px;
        height: 24px;
        margin-right: 5px;
        border-radius: 50rem;
        font-weight: bold;
        font-size: 10px;
    }
}

.dark {
    header {
        background-color: $dark-header-bg;
        border-bottom-color: $dark-header-bg !important;

        span {
            color: #f0f6fc;
        }
    }

    .bottom-nav {
        background-color: $dark-bg;
    }
}

// Profile dropdown panel lives in a teleport, so it cannot be reached by the scoped selectors above
:global(.profile-menu) {
    min-width: 16rem;
    padding: 0.35rem;

    .floating-menu-text,
    .dropdown-item-text {
        font-size: 14px;
        opacity: 1;
    }
}
</style>
