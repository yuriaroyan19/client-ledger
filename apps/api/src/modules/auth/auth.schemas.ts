import { z } from '../../lib/zod.js';
import { PASSWORD_MAX_LENGTH } from './password.js';

export const LoginBodySchema = z
  .strictObject({
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)).openapi({ example: 'admin@example.com' }),
    // Max length bounds argon2 work per request (DoS protection). No min here: never hint at the policy on login.
    password: z.string().min(1).max(PASSWORD_MAX_LENGTH).openapi({ example: 'change-me-please-123' }),
  })
  .openapi('LoginRequest');

export const AdminSchema = z
  .object({
    id: z.uuid(),
    email: z.email(),
    name: z.string(),
  })
  .openapi('Admin');

export const SessionSchema = z
  .object({
    token: z.string().openapi({ description: 'Opaque bearer token. Store server-side or in an httpOnly cookie only.' }),
    expiresAt: z.iso.datetime().openapi({ description: 'Absolute expiry; the session also expires after inactivity.' }),
    idleTimeoutSeconds: z.number().int(),
    admin: AdminSchema,
  })
  .openapi('Session');

export const LogoutAllResponseSchema = z.object({ revokedSessions: z.number().int() }).openapi('LogoutAllResponse');
