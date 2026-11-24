import type { z } from 'zod';
import { fieldErrorsFrom, type ApiError } from '@/lib/api/problem';

/**
 * Uniform state returned by every Server Action used with `useActionState`.
 * `values` echoes what the user typed, because React resets forms after an action runs —
 * without it a validation error would wipe the user's input.
 */
export interface FormState {
  status: 'idle' | 'error' | 'success';
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
}

export const initialFormState: FormState = { status: 'idle' };

export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string' && !key.startsWith('$ACTION')) values[key] = value;
  }
  return values;
}

export function validationFailed(error: z.ZodError, values: Record<string, string>): FormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    fieldErrors[key] ??= issue.message;
  }
  return { status: 'error', message: 'Please correct the highlighted fields.', fieldErrors, values };
}

export function apiFailed(error: ApiError, values: Record<string, string>): FormState {
  const fieldErrors = fieldErrorsFrom(error.problem);
  const message =
    error.status === 429
      ? (error.problem.detail ?? 'Too many attempts. Please wait and try again.')
      : error.status >= 500
        ? 'Something went wrong on our side. Please try again.'
        : (error.problem.detail ?? 'The request could not be completed.');
  return { status: 'error', message, fieldErrors, values };
}
