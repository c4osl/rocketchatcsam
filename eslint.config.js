// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        rules: {
            '@typescript-eslint/array-type': ['error', { default: 'generic' }],
            '@typescript-eslint/explicit-member-accessibility': ['error', { accessibility: 'explicit' }],
            'no-console': 'off',
            'no-redeclare': 'error',
            '@typescript-eslint/no-shadow': 'error',
            quotes: ['error', 'single'],
            'max-len': [
                'error',
                {
                    code: 160,
                    ignorePattern: '^import | *export .*? \\{',
                },
            ],
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        },
    },
    {
        ignores: ['dist/**', 'node_modules/**', '*.js'],
    },
);
