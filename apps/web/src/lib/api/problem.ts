/** RFC 9457 problem returned by the API (see apps/api/src/middleware/error-handler.ts). */
export interface Problem {
  type?: string;
  title?: string;
  status: number;
  code?: string;
  detail?: string;
  requestId?: string;
  issues?: Array<{ path: string; message: string }>;
}

export class ApiError extends Error {
  constructor(readonly problem: Problem) {
    super(problem.detail ?? problem.title ?? `API request failed with status ${problem.status}`);
    this.name = 'ApiError';
  }

  get status(): number {
    return this.problem.status;
  }
}

export function toProblem(status: number, body: unknown): Problem {
  if (body && typeof body === 'object' && 'status' in body) return body as Problem;
  return { status, detail: status >= 500 ? 'The server could not complete the request.' : 'Request failed.' };
}

/** Maps API issue paths like `body.email` to form field names like `email`. */
export function fieldErrorsFrom(problem: Problem): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of problem.issues ?? []) {
    const field = issue.path.replace(/^(body|query|params)\.?/, '') || '_form';
    errors[field] ??= issue.message;
  }
  return errors;
}
