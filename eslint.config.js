// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import security from 'eslint-plugin-security';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/out/**',
      '**/dist/**',
      '**/release/**',
      '**/test-results/**',
      'scripts/**',
      '**/*.worklet.js',
      '**/*.config.*',
      'eslint.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  security.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-confusing-void-expression': 'off',
      // `void promise` is our explicit "fire and forget" marker.
      'no-void': 'off',
      // Object-key access is pervasive and typed; this rule is noise for TS code.
      'security/detect-object-injection': 'off',
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name='innerHTML']",
          message: 'Never use innerHTML (§17.1).',
        },
        { selector: "CallExpression[callee.name='eval']", message: 'No eval (§17.1).' },
        {
          // A zustand selector returning a fresh []/{} re-renders forever (React #185, blank window).
          selector:
            "CallExpression[callee.name='useStore'] > ArrowFunctionExpression LogicalExpression > :matches(ArrayExpression, ObjectExpression)",
          message: 'Selectors must not create new arrays/objects — use EMPTY_LIST / EMPTY_RECORD.',
        },
        {
          selector:
            "CallExpression[callee.name='useStore'] > ArrowFunctionExpression > :matches(ArrayExpression, ObjectExpression)",
          message:
            'Selectors must not return new arrays/objects — select primitives or existing references.',
        },
      ],
      'no-new-func': 'error',
    },
  },
  {
    files: ['**/*.test.ts', 'apps/desktop/e2e/**'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      'security/detect-non-literal-fs-filename': 'off',
    },
  },
  {
    // Main-process file access is always rooted in app directories resolved at startup.
    files: ['apps/desktop/src/main/**', 'apps/desktop/src/workers/**'],
    rules: { 'security/detect-non-literal-fs-filename': 'off' },
  },
);
