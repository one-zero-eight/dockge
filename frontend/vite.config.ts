import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import Components from "unplugin-vue-components/vite";
import viteCompression from "vite-plugin-compression";
import "vue";

const viteCompressionFilter = /\.(js|mjs|json|css|html|svg)$/i;

// https://vitejs.dev/config/
export default defineConfig({
    server: {
        port: 5000,
    },
    define: {
        "FRONTEND_VERSION": JSON.stringify(process.env.npm_package_version),
    },
    root: "./frontend",
    resolve: {
        alias: {
            // yaml-language-server imports Node's path; browser workers need a polyfill.
            path: "path-browserify",
        },
    },
    worker: {
        format: "es",
    },
    build: {
        outDir: "../frontend-dist",
    },
    plugins: [
        vue(),
        Components(),
        viteCompression({
            algorithm: "gzip",
            filter: viteCompressionFilter,
        }),
        viteCompression({
            algorithm: "brotliCompress",
            filter: viteCompressionFilter,
        }),
    ],
});
