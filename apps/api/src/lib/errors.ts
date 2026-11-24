/**
 * Domain/HTTP errors. Throw these from services; the error middleware turns them into
 * RFC 9457 `application/problem+json` responses. Anything else becomes a generic 500
 * so internal details never leak to clients.
 */
export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export interface FieldIssue {
  path: string;
  message: string;
}

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly issues?: FieldIssue[],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(issues: FieldIssue[], message = 'Request validation failed') {
    super(422, 'VALIDATION_FAILED', message, issues);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, 'UNAUTHENTICATED', message);
  }
}

export class NotFoundError extends AppError {
  constructor(entity = 'Resource') {
    super(404, 'NOT_FOUND', `${entity} not found`);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, issues?: FieldIssue[]) {
    super(409, 'CONFLICT', message, issues);
  }
}

export class RateLimitedError extends AppError {
  constructor(message = 'Too many requests, please try again later') {
    super(429, 'RATE_LIMITED', message);
  }
}
