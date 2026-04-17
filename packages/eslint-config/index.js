import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "**/dist/**",
      "**/dist-electron/**",
      "**/.expo/**",
      "**/release/**",
      "**/_expo/**",
      "**/coverage/**",
      "packages/types/src/database.generated.ts"
    ]
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.config.js"],
    languageOptions: {
      sourceType: "script",
      globals: {
        module: "readonly",
        require: "readonly"
      }
    }
  },
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module"
      }
    },
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }]
    }
  }
];
