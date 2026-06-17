import type { FastifyRequest, FastifyReply } from 'fastify';
import twilio from 'twilio';
import { env } from '../config/env.js';

export async function verifyTwilioSignature(request: FastifyRequest, reply: FastifyReply) {
  const signature = request.headers['x-twilio-signature'] as string;
  const url = `${request.protocol}://${request.hostname}${request.url}`;
  const params = request.body as Record<string, string>;

  const isValid = twilio.validateRequest(env.TWILIO_AUTH_TOKEN, signature, url, params);

  if (!isValid) {
    reply.status(403).send({ error: 'Firma Twilio inválida', code: 'INVALID_SIGNATURE' });
  }
}
