import type { ApiRouter } from '../../lib/http/api-router.js';
import { ClientIdParamsSchema } from '../clients/clients.schemas.js';
import {
  CreateMovementBodySchema,
  ListMovementsQuerySchema,
  MovementPageSchema,
  MovementParamsSchema,
  MovementSchema,
  UpdateMovementBodySchema,
} from './movements.schemas.js';
import { movementsService } from './movements.service.js';

export function registerMovementRoutes(api: ApiRouter): void {
  api.route({
    method: 'get',
    path: '/clients/:clientId/movements',
    operationId: 'listMovements',
    summary: "List a client's movements",
    description: 'Filter by inclusive date range and type. Omit `from`/`to` for all time.',
    tags: ['Movements'],
    request: { params: ClientIdParamsSchema, query: ListMovementsQuerySchema },
    responses: {
      200: { description: 'A page of movements', schema: MovementPageSchema },
      404: { description: 'Client not found' },
    },
    handler: async ({ params, query, res }) => {
      res.json(await movementsService.list(params.clientId, query));
    },
  });

  api.route({
    method: 'post',
    path: '/clients/:clientId/movements',
    operationId: 'createMovement',
    summary: 'Record an earning or expense',
    tags: ['Movements'],
    request: { params: ClientIdParamsSchema, body: CreateMovementBodySchema },
    responses: {
      201: { description: 'Movement recorded', schema: MovementSchema },
      404: { description: 'Client not found' },
      409: { description: 'Client is archived' },
    },
    handler: async ({ params, body, auth, actor, res }) => {
      const movement = await movementsService.create(params.clientId, body, { ...actor, adminId: auth.admin.id });
      res.status(201).location(`/api/v1/clients/${params.clientId}/movements/${movement.id}`).json(movement);
    },
  });

  api.route({
    method: 'get',
    path: '/clients/:clientId/movements/:movementId',
    operationId: 'getMovement',
    summary: 'Get a movement',
    tags: ['Movements'],
    request: { params: MovementParamsSchema },
    responses: { 200: { description: 'The movement', schema: MovementSchema }, 404: { description: 'Not found' } },
    handler: async ({ params, res }) => {
      res.json(await movementsService.get(params.clientId, params.movementId));
    },
  });

  api.route({
    method: 'patch',
    path: '/clients/:clientId/movements/:movementId',
    operationId: 'updateMovement',
    summary: 'Update a movement',
    tags: ['Movements'],
    request: { params: MovementParamsSchema, body: UpdateMovementBodySchema },
    responses: {
      200: { description: 'Movement updated', schema: MovementSchema },
      404: { description: 'Not found' },
      409: { description: 'Client is archived' },
    },
    handler: async ({ params, body, actor, res }) => {
      res.json(await movementsService.update(params.clientId, params.movementId, body, actor));
    },
  });

  api.route({
    method: 'delete',
    path: '/clients/:clientId/movements/:movementId',
    operationId: 'deleteMovement',
    summary: 'Delete a movement',
    description: 'Soft delete: excluded from balances and lists, retained for audit.',
    tags: ['Movements'],
    request: { params: MovementParamsSchema },
    responses: {
      204: { description: 'Movement deleted' },
      404: { description: 'Not found' },
      409: { description: 'Client is archived' },
    },
    handler: async ({ params, actor, res }) => {
      await movementsService.remove(params.clientId, params.movementId, actor);
      res.status(204).end();
    },
  });
}
