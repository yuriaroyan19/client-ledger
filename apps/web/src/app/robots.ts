import type { MetadataRoute } from 'next';

/** Private application: disallow all crawling (also enforced by X-Robots-Tag and meta robots). */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', disallow: '/' }] };
}
