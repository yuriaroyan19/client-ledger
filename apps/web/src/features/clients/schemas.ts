import { z } from 'zod';

/**
 * Client-side mirror of the API rules for fast, friendly feedback. The API remains the
 * authority and re-validates everything (never trust the browser — or this server).
 */
const optionalText = (max: number) => z.string().trim().max(max).optional();

export const ClientFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120, 'Use at most 120 characters'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .refine((value) => value === '' || z.email().safeParse(value).success, 'Enter a valid email address')
    .optional(),
  phone: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || /^\+?[\d\s().-]{5,32}$/.test(value),
      'Use digits, spaces, ( ) . - and an optional leading +',
    )
    .optional(),
  notes: optionalText(2000),
});

export type ClientFormInput = z.output<typeof ClientFormSchema>;

/** Empty strings become null so the API clears the field. */
export function toClientPayload(input: ClientFormInput) {
  return {
    name: input.name,
    email: input.email || null,
    phone: input.phone || null,
    notes: input.notes || null,
  };
}

export const UuidSchema = z.uuid();
