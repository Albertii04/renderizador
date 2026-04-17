import js from "@eslint/js";
import renderizador from "./packages/eslint-config/index.js";

export default [js.configs.recommended, ...renderizador];
