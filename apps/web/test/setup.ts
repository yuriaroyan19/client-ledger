import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { fakeFetch, resetNextFakes } from './next-fakes';

// Every API call goes through the fake router (openapi-fetch captures `fetch` when the client is
// created, so the stub must be installed before any app module is imported).
globalThis.fetch = fakeFetch as typeof fetch;

vi.mock('next/headers', async () => (await import('./next-fakes')).nextHeaders);
vi.mock('next/cache', async () => (await import('./next-fakes')).nextCache);
vi.mock('next/navigation', async () => (await import('./next-fakes')).nextNavigation);

afterEach(() => {
  cleanup();
  resetNextFakes();
  vi.clearAllMocks();
});
