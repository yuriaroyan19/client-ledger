import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import './globals.css';

const APP_NAME = 'Client Ledger';
const DESCRIPTION = 'Private back-office for tracking client earnings, expenses and balances.';

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: DESCRIPTION,
  applicationName: APP_NAME,
  referrer: 'strict-origin-when-cross-origin',
  // Private admin tool: never index, cache or show snippets anywhere.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true, 'max-snippet': 0 },
  },
  formatDetection: { telephone: false, email: false, address: false },
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: 'default' },
  openGraph: { type: 'website', siteName: APP_NAME, title: APP_NAME, description: DESCRIPTION },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f7f9' },
    { media: '(prefers-color-scheme: dark)', color: '#0d1117' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Every page is rendered per request so the CSP nonce from src/proxy.ts can be applied to Next's scripts.
  await connection();
  return (
    <html lang="en">
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
