import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'src/generated', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-confusing-void-expression': 'off',
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
      // Architecture guardrails (see AGENTS.md):
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message: 'Read configuration from src/config/env.ts, never from process.env directly.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'zod', message: "Import { z } from 'src/lib/zod.ts' so schemas get .openapi()." },
            { name: '@prisma/client', message: "Import from 'src/generated/prisma/client.js'." },
          ],
        },
      ],
    },
  },
  {
    // The allowed exceptions to the guardrails above.
    // Config tests set process.env before importing env.ts, on purpose.
    files: [
      'src/config/env.ts',
      'src/lib/zod.ts',
      'src/scripts/**',
      'prisma.config.ts',
      'vitest.config.ts',
      'test/**',
      'src/**/*.test.ts',
    ],
    rules: { 'no-restricted-syntax': 'off', 'no-restricted-imports': 'off', 'no-console': 'off' },
  },
  {
    files: ['**/*.test.ts', 'test/**'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      // supertest response bodies are `any`; tests assert on their shape.
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },
  { files: ['eslint.config.js'], ...tseslint.configs.disableTypeChecked },
);
