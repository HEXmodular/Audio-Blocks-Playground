import globals from "globals";
import tseslint from "typescript-eslint";
import pluginUnusedImports from "eslint-plugin-unused-imports";

export default [
  {
    languageOptions: { globals: globals.browser },
  },
  ...tseslint.configs.recommended,
  {
    plugins: {
      "unused-imports": pluginUnusedImports,
    },
    rules: {
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
    },
  },
];
