'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { api } from '@/lib/api/client';
import { ApiError, toProblem } from '@/lib/api/problem';
import { safeNextPath } from '@/lib/auth/constants';
import { clearSessionToken, setSessionToken } from '@/lib/auth/session-cookie';
import { apiFailed, formValues, validationFailed, type FormState } from '@/lib/forms';

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address').max(254)),
  password: z.string().min(1, 'Enter your password').max(128),
  next: z.string().max(2048).optional(),
});

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  // Never echo the password back to the browser.
  const { password: _password, ...safeValues } = values;
  const parsed = LoginSchema.safeParse(values);
  if (!parsed.success) return validationFailed(parsed.error, safeValues);

  const { data, error, response } = await api.POST('/api/v1/auth/login', {
    body: { email: parsed.data.email, password: parsed.data.password },
  });
  if (!response.ok || !data) {
    if (response.status === 401) return { status: 'error', message: 'Invalid email or password.', values: safeValues };
    return apiFailed(new ApiError(toProblem(response.status, error)), safeValues);
  }

  await setSessionToken(data.token, new Date(data.expiresAt));
  redirect(safeNextPath(parsed.data.next) as Parameters<typeof redirect>[0]);
}

export async function logoutAction(): Promise<never> {
  // Revoke server-side first; the cookie is cleared even if the API is unreachable.
  await api.POST('/api/v1/auth/logout').catch(() => undefined);
  await clearSessionToken();
  redirect('/login?reason=signed-out');
}

export async function logoutEverywhereAction(): Promise<never> {
  await api.POST('/api/v1/auth/logout-all').catch(() => undefined);
  await clearSessionToken();
  redirect('/login?reason=signed-out-everywhere');
}
