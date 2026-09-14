import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';
import { supabase } from '../supabase.js';
import { sendWhatsAppMessage } from '../twilio.js';
import {
  getOrCreateSession,
  updateSessionContext,
  completeSession,
  saveMessage,
} from '../sessions.js';
import { buildSystemPrompt } from './prompts.js';
import { complaintTools } from './tools.js';
import { geocodeComplaint } from '../complaint-geo.js';
import {
  registerOffTopic,
  buildNotMunicipalMessage,
  clearStrikes,
} from '../moderation.js';
import type { SessionContext, UrgencyLevel } from '../../types/index.js';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

interface SaveComplaintInput {
  category_id: string;
  subcategory_id?: string;
  description: string;
  location?: string;
  summary: string;
  complainant_name?: string;
  confidence: number;
  urgency?: UrgencyLevel;
}

interface OutOfScopeInput {
  kind: 'not_municipal' | 'off_topic';
  suggested_authority?: string;
  reason: string;
}

export async function handleIncomingMessage(
  tenantId: string,
  phoneNumber: string,
  userMessage: string,
): Promise<void> {
  const session = await getOrCreateSession(tenantId, phoneNumber);
  const context = session.context as SessionContext;

  context.messages.push({ role: 'user', content: userMessage });
  context.attempts += 1;

  await saveMessage(session.id, tenantId, 'user', userMessage);

  const systemPrompt = await buildSystemPrompt(tenantId, context);

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: systemPrompt,
    tools: complaintTools,
    messages: context.messages.map((m) => ({ role: m.role, content: m.content })),
  });

  if (response.stop_reason === 'tool_use') {
    const toolUse = response.content.find((b) => b.type === 'tool_use');

    if (toolUse && toolUse.type === 'tool_use' && toolUse.name === 'save_complaint') {
      const input = toolUse.input as SaveComplaintInput;
      await createComplaint(tenantId, session.id, phoneNumber, input);
      await completeSession(session.id);

      // Un reclamo válido limpia los avisos previos: la persona usó bien el canal
      await clearStrikes(tenantId, phoneNumber).catch(() => {});

      const confirmMessage =
        '¡Gracias! Tu reclamo fue registrado correctamente y será atendido a la brevedad. 🏛️';
      await sendWhatsAppMessage(phoneNumber, confirmMessage);
      await saveMessage(session.id, tenantId, 'assistant', confirmMessage);
      return;
    }

    if (toolUse && toolUse.type === 'tool_use' && toolUse.name === 'out_of_scope') {
      const input = toolUse.input as OutOfScopeInput;
      await handleOutOfScope(tenantId, session.id, phoneNumber, input, context);
      return;
    }
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  const assistantText = textBlock && textBlock.type === 'text' ? textBlock.text : 'Lo siento, ocurrió un error. Por favor intentá de nuevo.';

  context.messages.push({ role: 'assistant', content: assistantText });
  await updateSessionContext(session.id, context);
  await saveMessage(session.id, tenantId, 'assistant', assistantText);
  await sendWhatsAppMessage(phoneNumber, assistantText);
}

/**
 * El mensaje quedó fuera del alcance del canal. Dos caminos bien distintos:
 *
 * - not_municipal: hay un problema real pero le toca a otro organismo. Se lo
 *   derivamos con buen tono y NO se le cuenta strike.
 * - off_topic: el mensaje no tiene relación con la municipalidad. Suma strike,
 *   recibe aviso y, si insiste, el número queda bloqueado.
 */
async function handleOutOfScope(
  tenantId: string,
  sessionId: string,
  phoneNumber: string,
  input: OutOfScopeInput,
  context: SessionContext,
): Promise<void> {
  let replyText: string;

  if (input.kind === 'not_municipal') {
    replyText = buildNotMunicipalMessage(input.suggested_authority);
  } else {
    const outcome = await registerOffTopic(tenantId, phoneNumber, input.reason);
    replyText = outcome.message;
  }

  context.messages.push({ role: 'assistant', content: replyText });
  await updateSessionContext(sessionId, context);
  await saveMessage(sessionId, tenantId, 'assistant', replyText);
  await sendWhatsAppMessage(phoneNumber, replyText);
}

async function createComplaint(
  tenantId: string,
  sessionId: string,
  phoneNumber: string,
  input: SaveComplaintInput,
): Promise<void> {
  const { data, error } = await supabase
    .from('complaints')
    .insert({
      tenant_id: tenantId,
      session_id: sessionId,
      category_id: input.category_id,
      subcategory_id: input.subcategory_id ?? null,
      phone_number: phoneNumber,
      complainant_name: input.complainant_name ?? null,
      description: input.description,
      location: input.location ?? null,
      summary: input.summary,
      status: 'pending',
      urgency: input.urgency ?? 'medium',
      urgency_source: 'ai',
      ai_confidence: input.confidence,
      raw_classification: input as unknown as Record<string, unknown>,
    })
    .select('id')
    .single();

  if (error || !data) return;

  // La geocodificación tarda ~1-2s (límite de 1 req/seg de Nominatim).
  // Va en segundo plano para no demorar la respuesta de WhatsApp al vecino.
  void geocodeComplaint(data.id, tenantId, input.location).catch(() => {
    /* el reclamo queda en geocode_status='pending' y lo reintenta el backfill */
  });
}
