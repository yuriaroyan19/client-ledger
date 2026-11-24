import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Client Ledger',
    short_name: 'Ledger',
    description: 'Private back-office for tracking client earnings, expenses and balances.',
    start_url: '/clients',
    display: 'standalone',
    background_color: '#f6f7f9',
    theme_color: '#2f5bea',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
