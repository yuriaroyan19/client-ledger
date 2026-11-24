/**
 * Escapes LIKE/ILIKE wildcards so user search input is matched literally.
 * Needed for raw SQL AND for Prisma `contains`/`startsWith`, which do not escape `%` and `_`.
 * Postgres uses backslash as the default LIKE escape character.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
