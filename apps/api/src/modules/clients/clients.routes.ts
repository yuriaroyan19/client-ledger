import type { ApiRouter } from '../../lib/http/api-router.js';
import {
  ClientIdParamsSchema,
  ClientPageSchema,
  ClientSchema,
  CreateClientBodySchema,
  ListClientsQuerySchema,
  UpdateClientBodySchema,
} from './clients.schemas.js';
import { clientsService } from './clients.service.js';

export function registerClientRoutes(api: ApiRouter): void {
  api.route({
    method: 'get',
    path: '/clients',
    operationId: 'listClients',
    summary: 'List clients',
    tags: ['Clients'],
    request: { query: ListClientsQuerySchema },
    responses: { 200: { description: 'A page of clients', schema: ClientPageSchema } },
    handler: async ({ query, res }) => {
      res.json(await clientsService.list(query));
    },
  });

  api.route({
    method: 'post',
    path: '/clients',
    operationId: 'createClient',
    summary: 'Create a client',
    tags: ['Clients'],
    request: { body: CreateClientBodySchema },
    responses: {
      201: { description: 'Client created', schema: ClientSchema },
      409: { description: 'Email already used by another client' },
    },
    handler: async ({ body, auth, actor, res }) => {
      const client = await clientsService.create(body, { ...actor, adminId: auth.admin.id });
      res.status(201).location(`/api/v1/clients/${client.id}`).json(client);
    },
  });

  api.route({
    method: 'get',
    path: '/clients/:clientId',
    operationId: 'getClient',
    summary: 'Get a client',
    tags: ['Clients'],
    request: { params: ClientIdParamsSchema },
    responses: { 200: { description: 'The client', schema: ClientSchema }, 404: { description: 'Not found' } },
    handler: async ({ params, res }) => {
      res.json(await clientsService.get(params.clientId));
    },
  });

  api.route({
    method: 'patch',
    path: '/clients/:clientId',
    operationId: 'updateClient',
    summary: 'Update a client',
    tags: ['Clients'],
    request: { params: ClientIdParamsSchema, body: UpdateClientBodySchema },
    responses: {
      200: { description: 'Client updated', schema: ClientSchema },
      404: { description: 'Not found' },
      409: { description: 'Email already used by another client' },
    },
    handler: async ({ params, body, actor, res }) => {
      res.json(await clientsService.update(params.clientId, body, actor));
    },
  });

  api.route({
    method: 'post',
    path: '/clients/:clientId/archive',
    operationId: 'archiveClient',
    summary: 'Archive a client',
    description: 'Hides the client from default lists and freezes its ledger. History is kept. Idempotent.',
    tags: ['Clients'],
    request: { params: ClientIdParamsSchema },
    responses: { 200: { description: 'Client archived', schema: ClientSchema }, 404: { description: 'Not found' } },
    handler: async ({ params, actor, res }) => {
      res.json(await clientsService.setArchived(params.clientId, true, actor));
    },
  });

  api.route({
    method: 'post',
    path: '/clients/:clientId/restore',
    operationId: 'restoreClient',
    summary: 'Restore an archived client',
    tags: ['Clients'],
    request: { params: ClientIdParamsSchema },
    responses: { 200: { description: 'Client restored', schema: ClientSchema }, 404: { description: 'Not found' } },
    handler: async ({ params, actor, res }) => {
      res.json(await clientsService.setArchived(params.clientId, false, actor));
    },
  });
}
