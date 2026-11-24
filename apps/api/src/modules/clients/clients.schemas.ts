import { MoneySchema } from '../../lib/money.js';
import { PaginationQuerySchema, pageSchema } from '../../lib/pagination.js';
import { z } from '../../lib/zod.js';

/** Empty strings from HTML forms are treated as "no value". */
const blankToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value);

const NameSchema = z.string().trim().min(1, 'Name is required').max(120).openapi({ example: 'Acme Corporation' });
const EmailSchema = z.preprocess(blankToNull, z.string().trim().toLowerCase().pipe(z.email().max(254)).nullable()).openapi({
  type: ['string', 'null'],
  format: 'email',
  example: 'billing@acme.test',
  description: 'Empty string or null clears it.',
});
const PhoneSchema = z
  .preprocess(
    blankToNull,
    z
      .string()
      .trim()
      .regex(/^\+?[\d\s().-]{5,32}$/, 'Phone may contain digits, spaces, parentheses, dots, dashes and a leading +')
      .nullable(),
  )
  .openapi({ type: ['string', 'null'], example: '+1 (555) 010-2030' });
const NotesSchema = z
  .preprocess(blankToNull, z.string().trim().max(2000).nullable())
  .openapi({ type: ['string', 'null'], maxLength: 2000 });

export const ClientIdParamsSchema = z.object({ clientId: z.uuid().openapi({ param: { name: 'clientId', in: 'path' } }) });

export const CreateClientBodySchema = z
  .strictObject({
    name: NameSchema,
    email: EmailSchema.optional(),
    phone: PhoneSchema.optional(),
    notes: NotesSchema.optional(),
  })
  .openapi('CreateClientRequest');

export const UpdateClientBodySchema = z
  .strictObject({
    name: NameSchema.optional(),
    email: EmailSchema.optional(),
    phone: PhoneSchema.optional(),
    notes: NotesSchema.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update')
  .openapi('UpdateClientRequest');

export const ListClientsQuerySchema = PaginationQuerySchema.extend({
  search: z.string().trim().max(100).optional().openapi({ description: 'Matches name, email or phone (case-insensitive).' }),
  status: z.enum(['active', 'archived', 'all']).default('active'),
  sort: z.enum(['name', 'newest', 'oldest']).default('name'),
});

export const ClientSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    notes: z.string().nullable(),
    archivedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    balance: MoneySchema.openapi({ description: 'All-time balance (earnings − expenses).' }),
  })
  .openapi('Client');

export const ClientPageSchema = pageSchema(ClientSchema, 'ClientPage');

export type CreateClientInput = z.output<typeof CreateClientBodySchema>;
export type UpdateClientInput = z.output<typeof UpdateClientBodySchema>;
export type ListClientsQuery = z.output<typeof ListClientsQuerySchema>;
export type ClientView = z.output<typeof ClientSchema>;
