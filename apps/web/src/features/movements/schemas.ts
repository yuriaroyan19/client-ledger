import { z } from 'zod';
import { isValidDateOnly } from '@/lib/date-range';

const AMOUNT = /^\d{1,12}(\.\d{1,2})?$/;
/** "1,250.50" style only. Any other comma ("12,50") is rejected, not guessed: it may be a decimal comma. */
const GROUPED_AMOUNT = /^\d{1,3}(,\d{3})+(\.\d{1,2})?$/;

export const MovementFormSchema = z.object({
  type: z.enum(['EARNING', 'EXPENSE'], { error: 'Choose earning or expense' }),
  // Accept "1,250.50" as typed by humans; send "1250.50" (a decimal string, never a float) to the API.
  amount: z
    .string()
    .trim()
    .refine((value) => AMOUNT.test(value) || GROUPED_AMOUNT.test(value), 'Enter an amount like 1250.50 (use a dot for decimals)')
    .transform((value) => value.replaceAll(',', ''))
    .refine((value) => AMOUNT.test(value), 'Amount is too large')
    .refine((value) => !AMOUNT.test(value) || Number(value) > 0, 'Amount must be greater than 0'),
  occurredOn: z.string().refine(isValidDateOnly, 'Enter a valid date'),
  description: z.string().trim().min(1, 'Description is required').max(500, 'Use at most 500 characters'),
});

export type MovementFormInput = z.output<typeof MovementFormSchema>;
