import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { generateOpenApiDocument } from './docs/openapi.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { anonymousRateLimit } from './middleware/rate-limit.js';
import { requestLogger } from './middleware/request-logger.js';
import { API_PREFIX, buildRouters } from './routes.js';

let routers: ReturnType<typeof buildRouters> | undefined;

export function createApp(): Express {
  routers ??= buildRouters();
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  app.set('query parser', 'simple'); // no nested objects from query strings

  app.use(requestLogger);
  // JSON API: lock everything down. The docs UI below gets its own, slightly relaxed CSP.
  app.use(
    helmet({
      contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-origin' },
    }),
  );
  app.use(
    cors({
      // Empty list = no cross-origin browser access at all (the web app calls the API server-side).
      origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : false,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
      maxAge: 600,
    }),
  );
  app.use(anonymousRateLimit);
  app.use(express.json({ limit: '16kb', strict: true }));

  // Authenticated responses are personal and financial: never cache them.
  app.use(API_PREFIX, (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.use('/health', routers.health);
  app.use(API_PREFIX, routers.api);

  if (env.SWAGGER_ENABLED) {
    const document = generateOpenApiDocument();
    app.get('/docs/openapi.json', (_req, res) => {
      res.json(document);
    });
    app.use(
      '/docs',
      helmet.contentSecurityPolicy({
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          frameAncestors: ["'none'"],
        },
      }),
      swaggerUi.serve,
      swaggerUi.setup(document, {
        customSiteTitle: 'Client Ledger API',
        swaggerOptions: { persistAuthorization: false, displayRequestDuration: true },
      }),
    );
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
