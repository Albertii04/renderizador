import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";
import renderer from "vite-plugin-electron-renderer";
import { resolve } from "node:path";
export default defineConfig({
    envDir: resolve(__dirname, "../../"),
    plugins: [
        react(),
        renderer(),
        electron({
            main: {
                entry: "src/main/index.ts"
            },
            preload: {
                input: "src/preload/index.ts"
            }
        })
    ],
    resolve: {
        alias: {
            "@": resolve(__dirname, "src/renderer")
        }
    }
});
