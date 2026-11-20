import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';

export default tseslint.config(
    {
        ignores: [
            'vendor/**',
            'node_modules/**',
            'public/**',
            'storage/**',
            'bootstrap/cache/**',
            'e2e/.results/**',
            'playwright-report/**',
        ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    // Formatting is Prettier's job, so only the correctness-oriented Vue rules are enabled.
    ...pluginVue.configs['flat/essential'],
    {
        files: ['**/*.vue'],
        languageOptions: { parserOptions: { parser: tseslint.parser } },
    },
    {
        languageOptions: { globals: { ...globals.browser, ...globals.node } },
        rules: {
            'vue/no-v-html': 'error',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
            eqeqeq: ['error', 'always'],
            'no-console': ['warn', { allow: ['warn', 'error'] }],
        },
    },
);
