import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';
import { handleIncomingMessage } from '../services/ai/agent.js';
import { getConversationMode, recordInbound } from '../services/conversation-mode.js';
import { getOrCreateSession, saveMessage } from '../services/sessions.js';
import { isBlocked } from '../services/moderation.js';
import { verifyTwilioSignature } from '../middleware/twilio-verify.js';

export async function webhookRoutes(app: FastifyInstance) {
  // El límite es por IP y Twilio reparte su tráfico entre pocas IPs, así que se
  // deja holgado: quien filtra los pedidos falsos es la firma, no este techo.
  app.post('/twilio', {
    preHandler: verifyTwilioSignature,
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
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
      routeIncoming(env.DEFAULT_TENANT_ID, phoneNumber, userMessage).catch((err) => {
        app.log.error({ err }, 'Error procesando mensaje de WhatsApp');
      });
    });
  });

  // Twilio a veces hace GET para verificar el webhook
  app.get('/twilio', async (_request, reply) => {
    reply.status(200).send('OK');
  });

  /**
   * Decide quién atiende el mensaje entrante.
   * Si un admin tomó la conversación, el agente IA no interviene: el mensaje
   * se guarda en el hilo y espera respuesta humana desde el panel.
   */
  async function routeIncoming(
    tenantId: string,
    phoneNumber: string,
    userMessage: string,
  ): Promise<void> {
    // El estado de toma de control es accesorio: si su tabla falla (migración
    // sin aplicar, base caída), el vecino igual tiene que ser atendido por la
    // IA en vez de quedarse sin respuesta. Por eso se degrada a modo agente.
    let conversation = null;
    try {
      // Reinicia la ventana de 24 h de WhatsApp en ambos modos
      await recordInbound(tenantId, phoneNumber);
      conversation = await getConversationMode(tenantId, phoneNumber);
    } catch (err) {
      app.log.error({ err, phoneNumber }, 'No se pudo leer el modo; se atiende con el agente IA');
    }

    // Un número bloqueado se descarta antes de todo: no llega a la IA, no
    // consume tokens y no recibe respuesta. Ya se le avisó al bloquearlo;
    // seguir contestándole convertiría el bloqueo en una conversación.
    if (isBlocked(conversation)) {
      app.log.info({ phoneNumber }, 'Mensaje descartado: número bloqueado');
      return;
    }

    if (conversation?.mode === 'human') {
      // El hilo al que se engancha es el del reclamo desde el que se tomó
      // la conversación; si se borró, se cae a la sesión activa del teléfono.
      const sessionId =
        conversation.session_id ?? (await getOrCreateSession(tenantId, phoneNumber)).id;

      await saveMessage(sessionId, tenantId, 'user', userMessage);
      app.log.info({ phoneNumber }, 'Mensaje recibido en modo humano: el agente no responde');
      return;
    }

    await handleIncomingMessage(tenantId, phoneNumber, userMessage);
  }
}
