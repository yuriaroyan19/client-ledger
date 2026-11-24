import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { Router, type Request, type RequestHandler, type Response } from 'express';
import { ProblemSchema, registry } from '../../docs/openapi.js';
import { authenticate } from '../../middleware/authenticate.js';
import { ValidationError, type FieldIssue } from '../errors.js';
import type { z, ZodType } from '../zod.js';
import { actorFrom, getAuth, type Actor, type AuthContext } from './auth-context.js';

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';
type AnyObjectSchema = z.ZodObject<z.ZodRawShape>;
type Infer<T> = T extends ZodType ? z.output<T> : undefined;

export interface RouteContext<P, Q, B, A extends boolean> {
  params: Infer<P>;
  query: Infer<Q>;
  body: Infer<B>;
  /** Present on authenticated routes (the default). */
  auth: A extends false ? AuthContext | undefined : AuthContext;
  actor: Actor;
  req: Request;
  res: Response;
}

export interface ResponseSpec {
  description: string;
  schema?: ZodType;
  /** Defaults to application/json. */
  contentType?: string;
}

export interface RouteSpec<
  P extends AnyObjectSchema | undefined,
  Q extends AnyObjectSchema | undefined,
  B extends ZodType | undefined,
  A extends boolean,
> {
  method: Method;
  /** Express-style path relative to the router base, e.g. `/clients/:clientId`. */
  path: string;
  operationId: string;
  summary: string;
  description?: string;
  tags: [string, ...string[]];
  /** Routes are authenticated unless explicitly set to `false`. */
  auth?: A;
  request?: { params?: P; query?: Q; body?: B };
  responses: Record<number, ResponseSpec>;
  /** Extra middleware run after authentication and before validation (e.g. rate limiters). */
  middleware?: RequestHandler[];
  handler: (ctx: RouteContext<P, Q, B, A>) => Promise<void> | void;
}

type Location = 'params' | 'query' | 'body';
type Validated = Record<Location, unknown>;

const PROBLEM_CONTENT = { 'application/problem+json': { schema: ProblemSchema } };

export function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function toIssues(error: z.ZodError, location: Location): FieldIssue[] {
  return error.issues.map((issue) => ({
    path: [location, ...issue.path.map(String)].join('.'),
    message: issue.message,
  }));
}

/**
 * A thin wrapper around an Express router where each route is declared ONCE and that
 * declaration drives: authentication, input validation (params/query/body), the typed
 * handler context, and the OpenAPI document. Handlers never see unvalidated input.
 */
export class ApiRouter {
  readonly router = Router();

  constructor(private readonly basePath: string) {}

  route<
    P extends AnyObjectSchema | undefined = undefined,
    Q extends AnyObjectSchema | undefined = undefined,
    B extends ZodType | undefined = undefined,
    A extends boolean = true,
  >(spec: RouteSpec<P, Q, B, A>): void {
    const requiresAuth = spec.auth !== false;
    const schemas: Array<[Location, ZodType | undefined]> = [
      ['params', spec.request?.params],
      ['query', spec.request?.query],
      ['body', spec.request?.body],
    ];

    this.document(spec, requiresAuth);

    const validate: RequestHandler = (req, res, next) => {
      const issues: FieldIssue[] = [];
      const validated: Validated = { params: undefined, query: undefined, body: undefined };
      for (const [location, schema] of schemas) {
        if (!schema) continue;
        const input: unknown = location === 'body' ? (req.body ?? {}) : req[location];
        const result = schema.safeParse(input);
        if (result.success) validated[location] = result.data;
        else issues.push(...toIssues(result.error, location));
      }
      if (issues.length > 0) return next(new ValidationError(issues));
      res.locals.validated = validated;
      next();
    };

    // Express 5 forwards rejected promises to the error middleware — no try/catch needed.
    const handle: RequestHandler = async (req, res) => {
      const validated = res.locals.validated as Validated;
      await spec.handler({
        params: validated.params as Infer<P>,
        query: validated.query as Infer<Q>,
        body: validated.body as Infer<B>,
        auth: getAuth(req) as RouteContext<P, Q, B, A>['auth'],
        actor: actorFrom(req),
        req,
        res,
      });
    };

    const chain: RequestHandler[] = [...(requiresAuth ? [authenticate] : []), ...(spec.middleware ?? []), validate, handle];
    this.router[spec.method](spec.path, ...chain);
  }

  private document(
    spec: RouteSpec<AnyObjectSchema | undefined, AnyObjectSchema | undefined, ZodType | undefined, boolean>,
    requiresAuth: boolean,
  ): void {
    const { params, query, body } = spec.request ?? {};
    const responses: RouteConfig['responses'] = {};

    for (const [status, response] of Object.entries(spec.responses)) {
      responses[status] = response.schema
        ? {
            description: response.description,
            content: { [response.contentType ?? 'application/json']: { schema: response.schema } },
          }
        : { description: response.description };
    }
    const addDefault = (status: number, description: string) => {
      if (!(status in responses)) responses[status] = { description, content: PROBLEM_CONTENT };
    };
    if (params || query || body) addDefault(422, 'Validation failed');
    if (requiresAuth) addDefault(401, 'Missing, invalid or expired session');
    addDefault(429, 'Rate limit exceeded');
    addDefault(500, 'Unexpected error');

    registry.registerPath({
      method: spec.method,
      path: toOpenApiPath(`${this.basePath}${spec.path}`),
      operationId: spec.operationId,
      summary: spec.summary,
      ...(spec.description && { description: spec.description }),
      tags: spec.tags,
      security: requiresAuth ? [{ bearerAuth: [] }] : [],
      request: {
        ...(params && { params }),
        ...(query && { query }),
        ...(body && { body: { required: true, content: { 'application/json': { schema: body } } } }),
      },
      responses,
    });
  }
}
