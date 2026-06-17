import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';
import { handleIncomingMessage } from '../services/ai/agent.js';

export async function webhookRoutes(app: FastifyInstance) {
  app.post('/twilio', async (request, reply) => {
    const body = request.body as Record<string, string>;
    const userMessage = body['Body'] ?? '';
    const from = body['From'] ?? '';

    // El número de WhatsApp viene como "whatsapp:+5491112345678"
    const phoneNumber = from.replace('whatsapp:', '');

    // Responder inmediatamente con TwiML vacío para no hacer timeout a Twilio
    reply.header('Content-Type', 'text/xml');
    reply.send('<Response></Response>');

    // Procesar el mensaje de forma asíncrona
    setImmediate(() => {
      handleIncomingMessage(env.DEFAULT_TENANT_ID, phoneNumber, userMessage).catch((err) => {
        app.log.error({ err }, 'Error procesando mensaje de WhatsApp');
      });
    });
  });

  // Twilio a veces hace GET para verificar el webhook
  app.get('/twilio', async (_request, reply) => {
    reply.status(200).send('OK');
  });
}
