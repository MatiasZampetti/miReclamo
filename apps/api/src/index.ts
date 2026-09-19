import './config/env.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env.js';
import { authRoutes } from './routes/auth.js';
import { webhookRoutes } from './routes/webhook.js';
import { complaintsRoutes } from './routes/complaints.js';
import { categoriesRoutes } from './routes/categories.js';
import { statsRoutes } from './routes/stats.js';
import { tenantRoutes } from './routes/tenant.js';

// trustProxy: en desarrollo la API vive detrás de ngrok. Sin esto request.protocol
// devuelve "http" y request.ip la IP del túnel, lo que rompe la validación de firma
// de Twilio y haría que el rate limit cuente a todos los vecinos como un solo cliente.
const app = Fastify({ logger: true, trustProxy: true });

await app.register(cors, {
  origin: env.WEB_URL,
  credentials: true,
});

// Techo general por IP. Las rutas que lo necesitan lo bajan en su propia config.
await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
});

await app.register(formbody);

await app.register(jwt, {
  secret: env.JWT_SECRET,
  sign: { expiresIn: '8h' },
});

app.setErrorHandler((error, _request, reply) => {
  const statusCode = error.statusCode ?? 500;
  app.log.error(error);
  reply.status(statusCode).send({
    error: error.message,
    code: error.code ?? 'INTERNAL_ERROR',
  });
});

await app.register(authRoutes, { prefix: '/api/auth' });
await app.register(webhookRoutes, { prefix: '/webhook' });
await app.register(complaintsRoutes, { prefix: '/api/complaints' });
await app.register(categoriesRoutes, { prefix: '/api/categories' });
await app.register(statsRoutes, { prefix: '/api/stats' });
await app.register(tenantRoutes, { prefix: '/api/tenant' });

app.get('/health', async () => ({ status: 'ok' }));

await app.listen({ port: parseInt(env.PORT), host: '0.0.0.0' });
