import js from '@eslint/js';
import n from 'eslint-plugin-n';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'coverage/', '.tmp-*/'] },
  js.configs.recommended,
  n.configs['flat/recommended-module'],
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      // Scripts are command-line tools: exiting with a status is what they're for.
      'n/no-process-exit': 'off',
    },
  },
  {
    files: ['scripts/**', 'tests/**'],
    rules: {
      // Dev tools may import dev dependencies (prettier is a peer at run time).
      'n/no-unpublished-import': 'off',
    },
  },
];
