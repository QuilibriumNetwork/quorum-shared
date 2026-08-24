// ESLint for quorum-shared.
//
// Added 2026-08-24. The repo had a `lint` script since before this config
// existed, and it could never have run: `node_modules/.bin/` held no eslint
// binary, no config file existed, and no eslint dependency was declared. So
// `yarn lint` failed with "'eslint' is not recognized" — not "lint found
// problems". The `yarn verify` gate not running it was the only reason nobody
// hit that, which is luck rather than a decision.
//
// That matters more here than the file count suggests: quorum-shared is where
// the primitives, hooks and sync protocol now live, so it is the code BOTH
// clients run. It was the least linted repo and the most shared.
//
// ## Why this is not a copy of quorum-desktop's config
//
// Desktop's config carries rules about desktop's own architecture — the
// identity-resolution ladder, a custom `no-ungated-debug-globals` rule, React
// Refresh boundaries for its Vite dev server. None of those describe a library.
// Copying them would import a pile of rules that either cannot fire here or
// would fire for reasons that have nothing to do with this code.
//
// What IS deliberately copied is the set of rule OVERRIDES, verbatim. Those
// encode "what counts as an error in this ecosystem", and the two repos
// disagreeing on that would be worse than either choice on its own: the same
// file, moved from desktop into shared during the ongoing migration, must not
// change from clean to dirty purely by crossing a repo boundary.
import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      'dist',
      'node_modules/**',
      // Mirrors desktop's ignore and for the same measured reason: a linked
      // worktree is a full second checkout with its own tsconfig.json, and
      // typescript-eslint fails to parse EVERY file when it finds several
      // candidate roots. Already gitignored; flat config does not read that.
      '.worktrees/**',
      '**/*.config.js',
      '.claude/**',
      '.agents/**',
    ],
  },
  {
    // Both platforms. `.native.tsx` files (19 of them) are ordinary TSX to
    // eslint — the split is resolved by the bundler, not by syntax — so they
    // need no separate block.
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      // `browser` rather than `node`: this is a library consumed by a web app
      // and a React Native app, so the globals it may legitimately reach for
      // are the DOM-ish ones. Node-only code here would be a bug worth seeing.
      globals: globals.browser,
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    settings: { react: { version: '19.0' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      ...tseslint.configs.recommended[1]?.rules,

      // ── Overrides copied verbatim from quorum-desktop's eslint.config.js.
      // Keep them in step: a file moving between the repos under the shared
      // migration must not change verdict just by moving.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      'no-unused-vars': 'off', // superseded by the TS rule above
      'react/display-name': 'off', // forwardRef / memo produce anonymous components
      'react/no-unescaped-entities': 'off', // quotes and apostrophes are needed for i18n
      'react/prop-types': 'off', // TypeScript already validates props
      'react/jsx-no-target-blank': 'off',
      'preserve-caught-error': 'warn', // ESLint 10 rule, deferred in both repos
      // react-hooks@7 ships the React Compiler rules on by default. Disabled
      // here exactly as in desktop, pending React Compiler adoption — turning
      // them on is an ecosystem decision, not a per-repo one.
      'react-hooks/immutability': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/use-memo': 'off',
    },
  },
];
