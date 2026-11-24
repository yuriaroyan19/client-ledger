import { z, type ZodType } from './zod.js';

export const MAX_PAGE_SIZE = 100;

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1).openapi({ example: 1 }),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20).openapi({ example: 20 }),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export function toSkipTake({ page, pageSize }: PaginationQuery): { skip: number; take: number } {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export function toPage<T>(items: T[], totalItems: number, { page, pageSize }: PaginationQuery): Page<T> {
  return { items, page, pageSize, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / pageSize)) };
}

export function pageSchema<T extends ZodType>(item: T, name: string) {
  return z
    .object({
      items: z.array(item),
      page: z.number().int(),
      pageSize: z.number().int(),
      totalItems: z.number().int(),
      totalPages: z.number().int(),
    })
    .openapi(name);
}
