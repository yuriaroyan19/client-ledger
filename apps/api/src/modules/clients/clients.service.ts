import type { Client, Prisma } from '../../generated/prisma/client.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import type { Actor } from '../../lib/http/auth-context.js';
import { formatMoney, type Decimal } from '../../lib/money.js';
import { toPage, toSkipTake, type Page } from '../../lib/pagination.js';
import { prisma, type DbClient, type DbTx } from '../../lib/prisma.js';
import { escapeLike } from '../../lib/sql.js';
import { auditService } from '../audit/audit.service.js';
import { balancesFor } from '../movements/ledger.js';
import type { ClientView, CreateClientInput, ListClientsQuery, UpdateClientInput } from './clients.schemas.js';

function toView(client: Client, balance: Decimal | undefined): ClientView {
  return {
    id: client.id,
    name: client.name,
    email: client.email,
    phone: client.phone,
    notes: client.notes,
    archivedAt: client.archivedAt?.toISOString() ?? null,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
    balance: formatMoney(balance),
  };
}

const ORDER_BY: Record<ListClientsQuery['sort'], Prisma.ClientOrderByWithRelationInput[]> = {
  name: [{ name: 'asc' }, { id: 'asc' }],
  newest: [{ createdAt: 'desc' }, { id: 'desc' }],
  oldest: [{ createdAt: 'asc' }, { id: 'asc' }],
};

async function assertEmailAvailable(email: string | null | undefined, exceptId?: string): Promise<void> {
  if (!email) return;
  const existing = await prisma.client.findUnique({ where: { email }, select: { id: true } });
  if (existing && existing.id !== exceptId) {
    throw new ConflictError('Another client already uses this email', [{ path: 'body.email', message: 'Email already in use' }]);
  }
}

export const clientsService = {
  async list(query: ListClientsQuery): Promise<Page<ClientView>> {
    const search = query.search ? escapeLike(query.search) : undefined;
    const where: Prisma.ClientWhereInput = {
      ...(query.status === 'active' && { archivedAt: null }),
      ...(query.status === 'archived' && { archivedAt: { not: null } }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
        ],
      }),
    };
    const [clients, total] = await prisma.$transaction([
      prisma.client.findMany({ where, orderBy: ORDER_BY[query.sort], ...toSkipTake(query) }),
      prisma.client.count({ where }),
    ]);
    const balances = await balancesFor(clients.map((client) => client.id));
    return toPage(
      clients.map((client) => toView(client, balances.get(client.id))),
      total,
      query,
    );
  },

  /** Throws NotFound. Use for every route that takes a clientId. */
  async getEntity(clientId: string, db: DbClient = prisma): Promise<Client> {
    const client = await db.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundError('Client');
    return client;
  },

  /**
   * Locks the client row for the rest of the transaction, so ledger changes and archive/restore of
   * the same client are serialised (no movement can slip in after the client was archived).
   */
  async lock(clientId: string, tx: DbTx): Promise<Client> {
    await tx.$executeRaw`SELECT 1 FROM clients WHERE id = ${clientId}::uuid FOR UPDATE`;
    return this.getEntity(clientId, tx);
  },

  /** Mutations on an archived client's ledger are not allowed. Call inside the mutation's transaction. */
  async getActiveEntity(clientId: string, tx: DbTx): Promise<Client> {
    const client = await this.lock(clientId, tx);
    if (client.archivedAt) throw new ConflictError('Client is archived. Restore it before changing its movements.');
    return client;
  },

  async get(clientId: string): Promise<ClientView> {
    const client = await this.getEntity(clientId);
    const balances = await balancesFor([client.id]);
    return toView(client, balances.get(client.id));
  },

  async create(input: CreateClientInput, actor: Actor & { adminId: string }): Promise<ClientView> {
    await assertEmailAvailable(input.email);
    const client = await prisma.$transaction(async (tx) => {
      const created = await tx.client.create({
        data: {
          name: input.name,
          email: input.email ?? null,
          phone: input.phone ?? null,
          notes: input.notes ?? null,
          createdById: actor.adminId,
        },
      });
      await auditService.record({ action: 'client.created', entityType: 'client', entityId: created.id }, actor, tx);
      return created;
    });
    return toView(client, undefined);
  },

  async update(clientId: string, input: UpdateClientInput, actor: Actor): Promise<ClientView> {
    await this.getEntity(clientId);
    await assertEmailAvailable(input.email, clientId);
    const client = await prisma.$transaction(async (tx) => {
      const updated = await tx.client.update({ where: { id: clientId }, data: input });
      await auditService.record(
        { action: 'client.updated', entityType: 'client', entityId: clientId, metadata: { fields: Object.keys(input) } },
        actor,
        tx,
      );
      return updated;
    });
    return toView(client, (await balancesFor([clientId])).get(clientId));
  },

  async setArchived(clientId: string, archived: boolean, actor: Actor): Promise<ClientView> {
    const client = await prisma.$transaction(async (tx) => {
      const existing = await this.lock(clientId, tx);
      if (Boolean(existing.archivedAt) === archived) return existing; // idempotent, not audited
      const updated = await tx.client.update({ where: { id: clientId }, data: { archivedAt: archived ? new Date() : null } });
      await auditService.record(
        { action: archived ? 'client.archived' : 'client.restored', entityType: 'client', entityId: clientId },
        actor,
        tx,
      );
      return updated;
    });
    return toView(client, (await balancesFor([clientId])).get(clientId));
  },
};
