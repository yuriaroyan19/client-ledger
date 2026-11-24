'use client';

import { useActionState } from 'react';
import { ButtonLink } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Alert } from '@/components/ui/primitives';
import { SubmitButton } from '@/components/ui/submit-button';
import type { FormState } from '@/lib/forms';
import { initialFormState } from '@/lib/forms';

interface ClientFormProps {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaults?: { name?: string; email?: string | null; phone?: string | null; notes?: string | null };
  submitLabel: string;
  cancelHref: '/clients' | `/clients/${string}`;
}

export function ClientForm({ action, defaults = {}, submitLabel, cancelHref }: ClientFormProps) {
  const [state, formAction] = useActionState(action, initialFormState);
  const value = (field: keyof NonNullable<ClientFormProps['defaults']>) => state.values?.[field] ?? defaults[field] ?? '';
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.status === 'error' && state.message && <Alert>{state.message}</Alert>}
      <Field label="Name" error={errors.name}>
        {(props) => <Input {...props} name="name" required maxLength={120} autoComplete="off" defaultValue={value('name')} />}
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Email" error={errors.email} hint="Optional. Must be unique.">
          {(props) => (
            <Input
              {...props}
              name="email"
              type="email"
              inputMode="email"
              maxLength={254}
              autoComplete="off"
              defaultValue={value('email')}
            />
          )}
        </Field>
        <Field label="Phone" error={errors.phone} hint="Optional.">
          {(props) => (
            <Input
              {...props}
              name="phone"
              type="tel"
              inputMode="tel"
              maxLength={32}
              autoComplete="off"
              defaultValue={value('phone')}
            />
          )}
        </Field>
      </div>
      <Field label="Notes" error={errors.notes} hint="Optional. Visible to administrators only.">
        {(props) => <Textarea {...props} name="notes" maxLength={2000} rows={4} defaultValue={value('notes')} />}
      </Field>
      <div className="flex items-center justify-end gap-2 border-t border-border pt-5">
        <ButtonLink href={cancelHref}>Cancel</ButtonLink>
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
