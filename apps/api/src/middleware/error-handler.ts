import { STATUS_CODES } from 'node:http';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '../generated/prisma/client.js';
import { AppError, type ErrorCode, type FieldIssue } from '../lib/errors.js';
import { requestIdOf } from '../lib/http/auth-context.js';

interface Problem {
  type: string;
  title: string;
  status: number;
  code: ErrorCode;
  detail: string;
  requestId?: string;
  issues?: FieldIssue[];
}

function problem(status: number, code: ErrorCode, detail: string, issues?: FieldIssue[]): Omit<Problem, 'requestId'> {
  return { type: 'about:blank', title: STATUS_CODES[status] ?? 'Error', status, code, detail, ...(issues && { issues }) };
}

/** Translate known error types into problems. Returns undefined for unexpected errors. */
function toProblem(error: unknown): Omit<Problem, 'requestId'> | undefined {
  if (error instanceof AppError) return problem(error.status, error.code, error.message, error.issues);

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2025') return problem(404, 'NOT_FOUND', 'Resource not found');
    if (error.code === 'P2002') return problem(409, 'CONFLICT', 'A record with the same unique value already exists');
  }

  // body-parser errors expose `type` and `status`.
  if (typeof error === 'object' && error !== null && 'type' in error) {
    const { type } = error;
    if (type === 'entity.parse.failed') return problem(400, 'BAD_REQUEST', 'Malformed JSON body');
    if (type === 'entity.too.large') return problem(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
    if (type === 'encoding.unsupported' || type === 'charset.unsupported')
      return problem(415, 'BAD_REQUEST', 'Unsupported request encoding');
  }
  return undefined;
}

export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {
  const known = toProblem(error);
  const body: Problem = {
    ...(known ?? problem(500, 'INTERNAL', 'An unexpected error occurred')),
    requestId: requestIdOf(req),
  };

  if (body.status >= 500) req.log.error({ err: error }, 'unhandled error');
  else req.log.debug({ err: error }, 'request failed');

  if (res.headersSent) {
    // Streaming responses (CSV) may fail mid-way: we can only terminate the connection.
    res.destroy();
    return;
  }
  res.status(body.status).type('application/problem+json').json(body);
};

export const notFoundHandler: RequestHandler = (req, res) => {
  res
    .status(404)
    .type('application/problem+json')
    .json({ ...problem(404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`), requestId: requestIdOf(req) });
};
