// @ts-check
const eslint = require("@eslint/js");
const tseslint = require("typescript-eslint");
const eslintConfigPrettier = require("eslint-config-prettier");

module.exports = tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        rules: {
            "@typescript-eslint/array-type": ["error", {default: "generic"}],
            "@typescript-eslint/explicit-member-accessibility": [
                "error",
                {accessibility: "explicit"},
            ],
            "no-console": "off",
            "no-redeclare": "error",
            "@typescript-eslint/no-shadow": "error",
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/no-unused-vars": [
                "warn",
                {argsIgnorePattern: "^_"},
            ],
        },
    },
    // disables any ESLint formatting rules that would conflict with Prettier,
    // must stay last so it overrides the presets above
    eslintConfigPrettier,
    {
        ignores: ["dist/**", "node_modules/**", "*.js"],
    },
);
