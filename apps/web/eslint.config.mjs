import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'coverage/**', 'next-env.d.ts', 'src/lib/api/schema.d.ts']),
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['error'] }],
    },
  },
  {
    // Architecture guardrail: Client Components must not import server-only modules.
    // (The `server-only` package also fails the build if this is ever violated.)
    files: ['src/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/schema.d.ts'], message: "Import API types via `Schemas` from '@/lib/api/client'." }] },
      ],
    },
  },
]);
