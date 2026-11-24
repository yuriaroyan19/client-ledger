'use client';

import { useActionState } from 'react';
import { Field, Input } from '@/components/ui/field';
import { Alert } from '@/components/ui/primitives';
import { SubmitButton } from '@/components/ui/submit-button';
import { loginAction } from '@/features/auth/actions';
import { initialFormState } from '@/lib/forms';

export function LoginForm({ next }: { next?: string | undefined }) {
  const [state, formAction] = useActionState(loginAction, initialFormState);
  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.status === 'error' && state.message && <Alert>{state.message}</Alert>}
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Email" error={state.fieldErrors?.email}>
        {(props) => (
          <Input
            {...props}
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            autoFocus
            defaultValue={state.values?.email ?? ''}
          />
        )}
      </Field>
      <Field label="Password" error={state.fieldErrors?.password}>
        {(props) => <Input {...props} name="password" type="password" autoComplete="current-password" required />}
      </Field>
      <SubmitButton className="w-full" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
