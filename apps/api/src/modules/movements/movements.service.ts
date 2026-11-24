import type { Movement, Prisma } from '../../generated/prisma/client.js';
import { formatDateOnly, parseDateOnly, toDateRange } from '../../lib/dates.js';
import { NotFoundError } from '../../lib/errors.js';
import type { Actor } from '../../lib/http/auth-context.js';
import { formatMoney } from '../../lib/money.js';
import { toPage, toSkipTake, type Page } from '../../lib/pagination.js';
import { prisma, type DbTx } from '../../lib/prisma.js';
import { auditService } from '../audit/audit.service.js';
import { clientsService } from '../clients/clients.service.js';
import { activeMovementsWhere } from './ledger.js';
import type { CreateMovementInput, ListMovementsQuery, MovementView, UpdateMovementInput } from './movements.schemas.js';

type MovementWithAuthor = Movement & { createdBy: { id: string; name: string } };

const withAuthor = { createdBy: { select: { id: true, name: true } } } as const;

export function toMovementView(movement: MovementWithAuthor): MovementView {
  return {
    id: movement.id,
    clientId: movement.clientId,
    type: movement.type,
    amount: formatMoney(movement.amount),
    signedAmount: formatMoney(movement.type === 'EARNING' ? movement.amount : movement.amount.negated()),
    occurredOn: formatDateOnly(movement.occurredOn),
    description: movement.description,
    createdBy: movement.createdBy,
    createdAt: movement.createdAt.toISOString(),
    updatedAt: movement.updatedAt.toISOString(),
  };
}

/** Stable ordering: same-day movements are ordered by creation time, then id. */
export function movementOrder(order: 'newest' | 'oldest'): Prisma.MovementOrderByWithRelationInput[] {
  const direction = order === 'newest' ? 'desc' : 'asc';
  return [{ occurredOn: direction }, { createdAt: direction }, { id: direction }];
}

async function getMovementEntity(clientId: string, movementId: string, db: DbTx): Promise<Movement> {
  const movement = await db.movement.findFirst({ where: { id: movementId, clientId, deletedAt: null } });
  if (!movement) throw new NotFoundError('Movement');
  return movement;
}

export const movementsService = {
  async list(clientId: string, query: ListMovementsQuery): Promise<Page<MovementView>> {
    await clientsService.getEntity(clientId);
    const where: Prisma.MovementWhereInput = {
      ...activeMovementsWhere({ clientId, range: toDateRange(query) }),
      ...(query.type && { type: query.type }),
    };
    const [movements, total] = await prisma.$transaction([
      prisma.movement.findMany({ where, include: withAuthor, orderBy: movementOrder(query.order), ...toSkipTake(query) }),
      prisma.movement.count({ where }),
    ]);
    return toPage(movements.map(toMovementView), total, query);
  },

  async get(clientId: string, movementId: string): Promise<MovementView> {
    await clientsService.getEntity(clientId);
    const movement = await prisma.movement.findFirst({
      where: { id: movementId, clientId, deletedAt: null },
      include: withAuthor,
    });
    if (!movement) throw new NotFoundError('Movement');
    return toMovementView(movement);
  },

  async create(clientId: string, input: CreateMovementInput, actor: Actor & { adminId: string }): Promise<MovementView> {
    return prisma.$transaction(async (tx) => {
      await clientsService.getActiveEntity(clientId, tx);
      const movement = await tx.movement.create({
        data: {
          clientId,
          type: input.type,
          amount: input.amount,
          occurredOn: parseDateOnly(input.occurredOn),
          description: input.description,
          createdById: actor.adminId,
        },
        include: withAuthor,
      });
      await auditService.record(
        {
          action: 'movement.created',
          entityType: 'movement',
          entityId: movement.id,
          metadata: { clientId, type: input.type, amount: input.amount, occurredOn: input.occurredOn },
        },
        actor,
        tx,
      );
      return toMovementView(movement);
    });
  },

  async update(clientId: string, movementId: string, input: UpdateMovementInput, actor: Actor): Promise<MovementView> {
    return prisma.$transaction(async (tx) => {
      // Lock first, then read: a concurrent archive or delete is either fully before or fully after us.
      await clientsService.getActiveEntity(clientId, tx);
      const before = await getMovementEntity(clientId, movementId, tx);
      const movement = await tx.movement.update({
        where: { id: movementId },
        data: {
          ...(input.type !== undefined && { type: input.type }),
          ...(input.amount !== undefined && { amount: input.amount }),
          ...(input.occurredOn !== undefined && { occurredOn: parseDateOnly(input.occurredOn) }),
          ...(input.description !== undefined && { description: input.description }),
        },
        include: withAuthor,
      });
      await auditService.record(
        {
          action: 'movement.updated',
          entityType: 'movement',
          entityId: movementId,
          metadata: {
            clientId,
            before: { type: before.type, amount: formatMoney(before.amount), occurredOn: formatDateOnly(before.occurredOn) },
            changes: input,
          },
        },
        actor,
        tx,
      );
      return toMovementView(movement);
    });
  },

  /** Soft delete: the row stays for auditing but is excluded from every balance and list. */
  async remove(clientId: string, movementId: string, actor: Actor): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await clientsService.getActiveEntity(clientId, tx);
      const movement = await getMovementEntity(clientId, movementId, tx);
      await tx.movement.update({ where: { id: movementId }, data: { deletedAt: new Date() } });
      await auditService.record(
        {
          action: 'movement.deleted',
          entityType: 'movement',
          entityId: movementId,
          metadata: { clientId, type: movement.type, amount: formatMoney(movement.amount) },
        },
        actor,
        tx,
      );
    });
  },
};
