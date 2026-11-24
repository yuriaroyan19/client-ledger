import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `server-only` throws outside React Server Components; tests run modules directly.
      'server-only': fileURLToPath(new URL('./test/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
    env: { NEXT_PUBLIC_CURRENCY: 'USD', TZ: 'America/New_York' },
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/lib/api/schema.d.ts', 'src/**/*.test.{ts,tsx}', 'src/app/globals.css'],
      // Pages, actions and route handlers included. Lowering this needs a reviewed reason.
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
