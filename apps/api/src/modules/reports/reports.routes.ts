import type { ApiRouter } from '../../lib/http/api-router.js';
import { ClientIdParamsSchema } from '../clients/clients.schemas.js';
import { exportClientStatement, exportOverview } from './reports.export.js';
import {
  ClientReportSchema,
  CsvSchema,
  OverviewQuerySchema,
  OverviewReportSchema,
  ReportQuerySchema,
} from './reports.schemas.js';
import { reportsService } from './reports.service.js';

const CSV_RESPONSE = { description: 'CSV file', schema: CsvSchema, contentType: 'text/csv' };

export function registerReportRoutes(api: ApiRouter): void {
  api.route({
    method: 'get',
    path: '/clients/:clientId/report',
    operationId: 'getClientReport',
    summary: 'Client balance report',
    description: 'Opening balance, earnings, expenses, net and closing balance for an inclusive date range (omit for all time).',
    tags: ['Reports'],
    request: { params: ClientIdParamsSchema, query: ReportQuerySchema },
    responses: { 200: { description: 'Report', schema: ClientReportSchema }, 404: { description: 'Client not found' } },
    handler: async ({ params, query, res }) => {
      res.json(await reportsService.clientReport(params.clientId, query));
    },
  });

  api.route({
    method: 'get',
    path: '/clients/:clientId/report/export',
    operationId: 'exportClientStatement',
    summary: 'Download a client statement (CSV)',
    description: 'Every movement in the range, oldest first, with a running balance.',
    tags: ['Reports'],
    request: { params: ClientIdParamsSchema, query: ReportQuerySchema },
    responses: { 200: CSV_RESPONSE, 404: { description: 'Client not found' } },
    handler: async ({ params, query, res }) => {
      await exportClientStatement(params.clientId, query, res);
    },
  });

  api.route({
    method: 'get',
    path: '/reports/overview',
    operationId: 'getOverviewReport',
    summary: 'Overview across all clients',
    description: 'Totals for the range plus a paginated per-client breakdown (archived clients included and flagged).',
    tags: ['Reports'],
    request: { query: OverviewQuerySchema },
    responses: { 200: { description: 'Overview', schema: OverviewReportSchema } },
    handler: async ({ query, res }) => {
      res.json(await reportsService.overview(query));
    },
  });

  api.route({
    method: 'get',
    path: '/reports/overview/export',
    operationId: 'exportOverviewReport',
    summary: 'Download the overview (CSV)',
    tags: ['Reports'],
    request: { query: OverviewQuerySchema },
    responses: { 200: CSV_RESPONSE },
    handler: async ({ query, res }) => {
      await exportOverview(query, res);
    },
  });
}
