import './config/env.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import jwt from '@fastify/jwt';
import { env } from './config/env.js';
import { authRoutes } from './routes/auth.js';
import { webhookRoutes } from './routes/webhook.js';
import { complaintsRoutes } from './routes/complaints.js';
import { categoriesRoutes } from './routes/categories.js';
import { statsRoutes } from './routes/stats.js';

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: process.env.WEB_URL || 'http://localhost:3000',
  credentials: true,
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

app.get('/health', async () => ({ status: 'ok' }));

await app.listen({ port: parseInt(env.PORT), host: '0.0.0.0' });
