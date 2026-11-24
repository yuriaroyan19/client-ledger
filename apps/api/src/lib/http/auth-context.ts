import type { Request } from 'express';

export interface AuthenticatedAdmin {
  id: string;
  email: string;
  name: string;
}

export interface AuthContext {
  admin: AuthenticatedAdmin;
  sessionId: string;
}

/** Who is acting + request metadata. Passed to services for auditing. */
export interface Actor {
  adminId: string | null;
  ip: string | null;
  requestId: string | null;
  userAgent: string | null;
}

const AUTH_KEY = Symbol('auth');

type RequestWithAuth = Request & { [AUTH_KEY]?: AuthContext };

export function setAuth(req: Request, auth: AuthContext): void {
  (req as RequestWithAuth)[AUTH_KEY] = auth;
}

export function getAuth(req: Request): AuthContext | undefined {
  return (req as RequestWithAuth)[AUTH_KEY];
}

/** pino-http assigns `req.id`; it is a string or number in practice. */
export function requestIdOf(req: Request): string | undefined {
  const id: unknown = req.id;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : undefined;
}

export function actorFrom(req: Request): Actor {
  return {
    adminId: getAuth(req)?.admin.id ?? null,
    ip: req.ip ?? null,
    requestId: requestIdOf(req) ?? null,
    userAgent: req.get('user-agent')?.slice(0, 512) ?? null,
  };
}
