import { DateOnlySchema, DateRangeQuerySchema } from '../../lib/dates.js';
import { MoneySchema, PositiveMoneySchema } from '../../lib/money.js';
import { PaginationQuerySchema, pageSchema } from '../../lib/pagination.js';
import { z } from '../../lib/zod.js';

export const MovementTypeSchema = z.enum(['EARNING', 'EXPENSE']).openapi('MovementType');

const DescriptionSchema = z
  .string()
  .trim()
  .min(1, 'Description is required')
  .max(500)
  .openapi({ example: 'Consulting — October' });

export const MovementParamsSchema = z.object({
  clientId: z.uuid().openapi({ param: { name: 'clientId', in: 'path' } }),
  movementId: z.uuid().openapi({ param: { name: 'movementId', in: 'path' } }),
});

export const CreateMovementBodySchema = z
  .strictObject({
    type: MovementTypeSchema,
    amount: PositiveMoneySchema,
    occurredOn: DateOnlySchema,
    description: DescriptionSchema,
  })
  .openapi('CreateMovementRequest');

export const UpdateMovementBodySchema = z
  .strictObject({
    type: MovementTypeSchema.optional(),
    amount: PositiveMoneySchema.optional(),
    occurredOn: DateOnlySchema.optional(),
    description: DescriptionSchema.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update')
  .openapi('UpdateMovementRequest');

export const ListMovementsQuerySchema = DateRangeQuerySchema.safeExtend({
  ...PaginationQuerySchema.shape,
  type: MovementTypeSchema.optional(),
  order: z.enum(['newest', 'oldest']).default('newest'),
});

export const MovementSchema = z
  .object({
    id: z.uuid(),
    clientId: z.uuid(),
    type: MovementTypeSchema,
    amount: MoneySchema.openapi({ description: 'Always positive; `type` carries the direction.', example: '1250.00' }),
    signedAmount: MoneySchema.openapi({ description: 'Positive for earnings, negative for expenses.' }),
    occurredOn: z.string().openapi({ format: 'date', example: '2026-11-24' }),
    description: z.string(),
    createdBy: z.object({ id: z.uuid(), name: z.string() }),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi('Movement');

export const MovementPageSchema = pageSchema(MovementSchema, 'MovementPage');

export type CreateMovementInput = z.output<typeof CreateMovementBodySchema>;
export type UpdateMovementInput = z.output<typeof UpdateMovementBodySchema>;
export type ListMovementsQuery = z.output<typeof ListMovementsQuerySchema>;
export type MovementView = z.output<typeof MovementSchema>;
