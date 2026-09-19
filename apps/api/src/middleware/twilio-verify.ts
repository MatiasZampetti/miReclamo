import type { FastifyRequest, FastifyReply } from 'fastify';
import twilio from 'twilio';
import { env } from '../config/env.js';

/**
 * Valida que el POST al webhook venga realmente de Twilio.
 *
 * Twilio firma sobre la URL pública exacta que invocó. Detrás de ngrok eso es
 * https://algo.ngrok-free.dev/webhook/twilio, pero el server recibe http en
 * localhost: por eso Fastify se registra con trustProxy y la URL se reconstruye
 * desde los headers X-Forwarded-*. Sin eso la firma nunca coincide.
 */
export async function verifyTwilioSignature(request: FastifyRequest, reply: FastifyReply) {
  const signature = request.headers['x-twilio-signature'] as string | undefined;
  const url = `${request.protocol}://${request.hostname}${request.url}`;
  const params = (request.body ?? {}) as Record<string, string>;

  if (!signature || !twilio.validateRequest(env.TWILIO_AUTH_TOKEN, signature, url, params)) {
    // La URL calculada es lo primero que hay que mirar si esto empieza a fallar
    // de golpe: un túnel nuevo o un proxy que no manda X-Forwarded-Proto la rompen.
    request.log.warn({ url, tieneFirma: Boolean(signature) }, 'Firma de Twilio inválida');
    return reply.status(403).send({ error: 'Firma Twilio inválida', code: 'INVALID_SIGNATURE' });
  }
}
