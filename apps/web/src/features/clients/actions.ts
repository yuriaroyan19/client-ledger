'use server';

import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { api, mutate } from '@/lib/api/client';
import { apiFailed, formValues, validationFailed, type FormState } from '@/lib/forms';
import { ClientFormSchema, toClientPayload, UuidSchema } from './schemas';

export async function createClientAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = ClientFormSchema.safeParse(values);
  if (!parsed.success) return validationFailed(parsed.error, values);

  const result = await mutate(api.POST('/api/v1/clients', { body: toClientPayload(parsed.data) }));
  if (!result.ok) return apiFailed(result.error, values);

  redirect(`/clients/${result.data.id}?created=1` as Route);
}

export async function updateClientAction(clientId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const id = UuidSchema.safeParse(clientId);
  const parsed = ClientFormSchema.safeParse(values);
  if (!id.success) return { status: 'error', message: 'Unknown client.' };
  if (!parsed.success) return validationFailed(parsed.error, values);

  const result = await mutate(
    api.PATCH('/api/v1/clients/{clientId}', { params: { path: { clientId: id.data } }, body: toClientPayload(parsed.data) }),
  );
  if (!result.ok) return apiFailed(result.error, values);

  revalidatePath(`/clients/${id.data}`);
  redirect(`/clients/${id.data}?updated=1` as Route);
}

export async function setClientArchivedAction(clientId: string, archived: boolean): Promise<void> {
  const id = UuidSchema.parse(clientId);
  const path = archived ? '/api/v1/clients/{clientId}/archive' : '/api/v1/clients/{clientId}/restore';
  const result = await mutate(api.POST(path, { params: { path: { clientId: id } } }));
  if (!result.ok) throw result.error;
  revalidatePath('/clients');
  revalidatePath(`/clients/${id}`);
}
