import 'server-only';
import { isIP } from 'node:net';

/**
 * Identity headers the BFF forwards to the API, so its rate limits and audit log see the end user.
 *
 * X-Forwarded-For is attacker-controlled unless a proxy WE run appended to it. With
 * `trustedHops` = N we take the N-th entry from the right (the address our outermost proxy saw).
 * With 0 (app exposed directly) the header is ignored, because Next.js keeps a client-sent value.
 */
export function forwardedHeaders(incoming: Headers, trustedHops: number): Record<string, string> {
  const forwarded: Record<string, string> = {};
  const chain =
    incoming
      .get('x-forwarded-for')
      ?.split(',')
      .map((entry) => entry.trim()) ?? [];
  const clientIp = trustedHops > 0 ? chain[chain.length - trustedHops] : undefined;
  if (clientIp && isIP(clientIp)) forwarded['X-Forwarded-For'] = clientIp;
  const userAgent = incoming.get('user-agent');
  if (userAgent) forwarded['User-Agent'] = userAgent.slice(0, 512);
  return forwarded;
}
