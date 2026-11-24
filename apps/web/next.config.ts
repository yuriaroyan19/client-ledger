import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';

/**
 * Static security headers for every response. The Content-Security-Policy is per-request
 * (it carries a nonce), so it is set in src/proxy.ts instead.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
  // Private back-office: keep it out of search engines even if robots.txt is ignored.
  { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
  ...(isProd ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }] : []),
];

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  typedRoutes: true,
  experimental: {
    serverActions: { bodySizeLimit: '64kb' },
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
