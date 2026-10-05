import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';
import { handleIncomingMessage } from '../services/ai/agent.js';
import { getConversationMode, recordInbound } from '../services/conversation-mode.js';
import { getOrCreateSession, saveMessage } from '../services/sessions.js';
import { isBlocked } from '../services/moderation.js';
import { verifyTwilioSignature } from '../middleware/twilio-verify.js';
import { sendWhatsAppMessage } from '../services/twilio.js';
import {
  appendComplaintPhotos,
  describeInbound,
  downloadTwilioMedia,
  isSupportedImage,
  storeTwilioPhoto,
} from '../services/media.js';
import { canTranscribe, transcribeAudio } from '../services/transcription.js';
import type { InboundMessage } from '../types/index.js';

/**
 * Cola por teléfono. En WhatsApp es común mandar la foto y enseguida el texto:
 * llegan como dos webhooks casi simultáneos y, procesados en paralelo, los dos
 * leerían la misma sesión y el segundo pisaría lo que guardó el primero (la
 * foto, por ejemplo). Encadenarlos por número los procesa en orden.
 */
const queues = new Map<string, Promise<void>>();

function enqueue(phoneNumber: string, task: () => Promise<void>): Promise<void> {
  const previous = queues.get(phoneNumber) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  queues.set(phoneNumber, next);
  // La limpieza no puede heredar el rechazo de la tarea: un .finally() suelto
  // lo propagaría como promesa rechazada sin manejar y Node cerraría la API.
  const cleanup = () => {
    if (queues.get(phoneNumber) === next) queues.delete(phoneNumber);
  };
  next.then(cleanup, cleanup);
  return next;
}

export async function webhookRoutes(app: FastifyInstance) {
  // El límite es por IP y Twilio reparte su tráfico entre pocas IPs, así que se
  // deja holgado: quien filtra los pedidos falsos es la firma, no este techo.
  app.post('/twilio', {
    preHandler: verifyTwilioSignature,
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const body = request.body as Record<string, string>;
    const from = body['From'] ?? '';

    // El número de WhatsApp viene como "whatsapp:+5491112345678"
    const phoneNumber = from.replace('whatsapp:', '');

    // Responder inmediatamente con TwiML vacío para no hacer timeout a Twilio
    reply.header('Content-Type', 'text/xml');
    reply.send('<Response></Response>');

    // Procesar el mensaje de forma asíncrona, en orden por número
    setImmediate(() => {
      enqueue(phoneNumber, () => routeIncoming(env.DEFAULT_TENANT_ID, phoneNumber, body)).catch((err) => {
        app.log.error({ err }, 'Error procesando mensaje de WhatsApp');
      });
    });
  });

  // Twilio a veces hace GET para verificar el webhook
  app.get('/twilio', async (_request, reply) => {
    reply.status(200).send('OK');
  });

  /**
   * Arma el mensaje entrante a partir de los campos de Twilio: texto, fotos
   * (NumMedia / MediaUrlN / MediaContentTypeN) y ubicación compartida
   * (Latitude / Longitude / Address / Label).
   */
  async function parseInbound(
    tenantId: string,
    phoneNumber: string,
    body: Record<string, string>,
  ): Promise<InboundMessage> {
    const inbound: InboundMessage = {
      text: (body['Body'] ?? '').trim(),
      photos: [],
      unsupportedMedia: [],
      failedPhotos: 0,
      transcript: null,
      failedAudios: 0,
      location: null,
    };
    const transcripts: string[] = [];

    const numMedia = parseInt(body['NumMedia'] ?? '0', 10) || 0;
    for (let i = 0; i < numMedia; i++) {
      const url = body[`MediaUrl${i}`];
      const type = body[`MediaContentType${i}`] ?? 'desconocido';
      if (!url) continue;

      if (canTranscribe(type)) {
        try {
          const text = await transcribeAudio(await downloadTwilioMedia(url), type);
          if (text) transcripts.push(text);
          else inbound.failedAudios += 1; // audio mudo o solo ruido
        } catch (err) {
          inbound.failedAudios += 1;
          app.log.error({ err, phoneNumber }, 'No se pudo transcribir el audio del vecino');
        }
        continue;
      }

      if (!isSupportedImage(type)) {
        inbound.unsupportedMedia.push(type);
        continue;
      }
      try {
        inbound.photos.push(await storeTwilioPhoto(tenantId, phoneNumber, url, type));
      } catch (err) {
        inbound.failedPhotos += 1;
        app.log.error({ err, phoneNumber }, 'No se pudo guardar la foto del vecino');
      }
    }

    const lat = parseFloat(body['Latitude'] ?? '');
    const lng = parseFloat(body['Longitude'] ?? '');
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const label = [body['Label'], body['Address']].filter(Boolean).join(', ');
      inbound.location = { latitude: lat, longitude: lng, label: label || null };
    }

    if (transcripts.length > 0) inbound.transcript = transcripts.join(' ');
    return inbound;
  }

  /**
   * Decide quién atiende el mensaje entrante.
   * Si un admin tomó la conversación, el agente IA no interviene: el mensaje
   * se guarda en el hilo y espera respuesta humana desde el panel.
   */
  async function routeIncoming(
    tenantId: string,
    phoneNumber: string,
    body: Record<string, string>,
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

    // Recién ahora se bajan las fotos: las de un número bloqueado ni se guardan
    const inbound = await parseInbound(tenantId, phoneNumber, body);

    // La toma de control siempre se hace desde un reclamo. Si ese reclamo se
    // borró, ya no hay botón en el panel para devolverle la charla al agente
    // y el vecino quedaría hablándole a nadie: se lo atiende con el agente.
    if (conversation?.mode === 'human' && conversation.complaint_id) {
      // El hilo al que se engancha es el del reclamo desde el que se tomó
      // la conversación; si se borró, se cae a la sesión activa del teléfono.
      const sessionId =
        conversation.session_id ?? (await getOrCreateSession(tenantId, phoneNumber)).id;

      await saveMessage(sessionId, tenantId, 'user', describeInbound(inbound));

      // Las fotos que manda mientras lo atiende un admin son evidencia del
      // mismo reclamo: se suman a él para que no queden sueltas en Storage.
      if (conversation.complaint_id) {
        await appendComplaintPhotos(conversation.complaint_id, tenantId, inbound.photos);
      }
      app.log.info({ phoneNumber }, 'Mensaje recibido en modo humano: el agente no responde');
      return;
    }

    try {
      await handleIncomingMessage(tenantId, phoneNumber, inbound);
    } catch (err) {
      // Sin esto el vecino queda hablándole a la nada (IA caída, sin crédito,
      // base con problemas). Se le avisa y el error sigue a los logs.
      await sendWhatsAppMessage(
        phoneNumber,
        'Disculpá, en este momento tenemos un problema técnico y no podemos tomar tu reclamo. ' +
          'Por favor intentá de nuevo más tarde.',
      ).catch(() => {});
      throw err;
    }
  }
}
