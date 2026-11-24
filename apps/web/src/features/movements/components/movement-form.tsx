'use client';

import { useActionState, useId } from 'react';
import { ButtonLink } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Alert } from '@/components/ui/primitives';
import { SubmitButton } from '@/components/ui/submit-button';
import { cn } from '@/lib/cn';
import { currencyCode } from '@/lib/format';
import { initialFormState, type FormState } from '@/lib/forms';

interface MovementFormProps {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaults?: { type?: 'EARNING' | 'EXPENSE'; amount?: string; occurredOn?: string; description?: string };
  submitLabel: string;
  cancelHref?: `/clients/${string}`;
  /** Today's date (YYYY-MM-DD) computed on the server, so SSR and hydration agree. */
  today: string;
}

const TYPES = [
  { value: 'EARNING', label: 'Earning', active: 'border-positive bg-positive-soft text-positive' },
  { value: 'EXPENSE', label: 'Expense', active: 'border-negative bg-negative-soft text-negative' },
] as const;

export function MovementForm({ action, defaults = {}, submitLabel, cancelHref, today }: MovementFormProps) {
  const [state, formAction] = useActionState(action, initialFormState);
  const groupId = useId();
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};
  const value = (field: keyof NonNullable<MovementFormProps['defaults']>) => state.values?.[field] ?? defaults[field] ?? '';
  const selectedType = value('type') || 'EARNING';

  return (
    // `key` remounts the form after each success so defaults (kept type/date) re-apply cleanly.
    <form key={state.status === 'success' ? state.message : 'form'} action={formAction} className="space-y-4" noValidate>
      {state.status === 'error' && state.message && <Alert>{state.message}</Alert>}
      {state.status === 'success' && state.message && <Alert tone="positive">{state.message}</Alert>}

      <fieldset>
        <legend id={groupId} className="mb-1.5 text-sm font-medium">
          Type
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {TYPES.map((type) => (
            <label key={type.value} className="cursor-pointer">
              <input
                type="radio"
                name="type"
                value={type.value}
                defaultChecked={selectedType === type.value}
                className="peer sr-only"
              />
              <span
                className={cn(
                  'flex h-10 items-center justify-center rounded-lg border border-border-strong text-sm font-medium text-muted transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent',
                  type.value === 'EARNING'
                    ? 'peer-checked:border-positive peer-checked:bg-positive-soft peer-checked:text-positive'
                    : 'peer-checked:border-negative peer-checked:bg-negative-soft peer-checked:text-negative',
                )}
              >
                {type.label}
              </span>
            </label>
          ))}
        </div>
        {errors.type && <p className="mt-1.5 text-sm text-negative">{errors.type}</p>}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Amount (${currencyCode})`} error={errors.amount}>
          {(props) => (
            <Input
              {...props}
              name="amount"
              inputMode="decimal"
              placeholder="0.00"
              autoComplete="off"
              required
              defaultValue={value('amount')}
            />
          )}
        </Field>
        <Field label="Date" error={errors.occurredOn}>
          {(props) => <Input {...props} name="occurredOn" type="date" required defaultValue={value('occurredOn') || today} />}
        </Field>
      </div>

      <Field label="Description" error={errors.description}>
        {(props) => (
          <Input
            {...props}
            name="description"
            maxLength={500}
            required
            placeholder="e.g. Consulting — November"
            defaultValue={value('description')}
          />
        )}
      </Field>

      <div className="flex items-center justify-end gap-2">
        {cancelHref && <ButtonLink href={cancelHref}>Cancel</ButtonLink>}
        <SubmitButton pendingLabel="Saving…" className={cancelHref ? undefined : 'w-full'}>
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}
