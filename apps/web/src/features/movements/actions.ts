'use server';

import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { api, mutate } from '@/lib/api/client';
import { apiFailed, formValues, validationFailed, type FormState } from '@/lib/forms';
import { formatMoney } from '@/lib/format';
import { UuidSchema } from '../clients/schemas';
import { MovementFormSchema } from './schemas';

function ids(...values: string[]): string[] | null {
  const parsed = values.map((value) => UuidSchema.safeParse(value));
  return parsed.every((result) => result.success) ? parsed.map((result) => result.data as string) : null;
}

export async function createMovementAction(clientId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const valid = ids(clientId);
  if (!valid) return { status: 'error', message: 'Unknown client.' };
  const parsed = MovementFormSchema.safeParse(values);
  if (!parsed.success) return validationFailed(parsed.error, values);

  const result = await mutate(
    api.POST('/api/v1/clients/{clientId}/movements', { params: { path: { clientId: clientId } }, body: parsed.data }),
  );
  if (!result.ok) return apiFailed(result.error, values);

  revalidatePath(`/clients/${clientId}`);
  const kind = parsed.data.type === 'EARNING' ? 'Earning' : 'Expense';
  // Keep type + date for fast consecutive entry; clear amount and description.
  return {
    status: 'success',
    message: `${kind} of ${formatMoney(result.data.amount)} recorded.`,
    values: { type: parsed.data.type, occurredOn: parsed.data.occurredOn },
  };
}

export async function updateMovementAction(
  clientId: string,
  movementId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  if (!ids(clientId, movementId)) return { status: 'error', message: 'Unknown movement.' };
  const parsed = MovementFormSchema.safeParse(values);
  if (!parsed.success) return validationFailed(parsed.error, values);

  const result = await mutate(
    api.PATCH('/api/v1/clients/{clientId}/movements/{movementId}', {
      params: { path: { clientId, movementId } },
      body: parsed.data,
    }),
  );
  if (!result.ok) return apiFailed(result.error, values);

  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}?movement=updated` as Route);
}

export async function deleteMovementAction(clientId: string, movementId: string): Promise<void> {
  if (!ids(clientId, movementId)) throw new Error('Unknown movement.');
  const result = await mutate(
    api.DELETE('/api/v1/clients/{clientId}/movements/{movementId}', { params: { path: { clientId, movementId } } }),
  );
  if (!result.ok && result.error.status !== 404) throw result.error;
  revalidatePath(`/clients/${clientId}`);
}
