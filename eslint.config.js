import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        chrome: "readonly"
      }
    },
    plugins: {
      react
    },
    settings: {
      react: {
        version: "detect"
      }
    }
  },
  prettier
);
