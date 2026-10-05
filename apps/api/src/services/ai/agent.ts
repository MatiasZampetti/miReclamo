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
import { startChat } from './llm.js';
import { geocodeComplaint, getTenantMapConfig } from '../complaint-geo.js';
import { geocodeAddress, type GeocodeResult } from '../geocoding.js';
import {
  registerOffTopic,
  buildNotMunicipalMessage,
  clearStrikes,
} from '../moderation.js';
import {
  getCitizen,
  normalizeDni,
  normalizeFullName,
  registerCitizen,
  type Citizen,
} from '../citizens.js';
import { describeInbound } from '../media.js';
import { complaintCode, describeComplaintStatus } from '../complaint-status.js';
import type { InboundMessage, SessionContext, UrgencyLevel } from '../../types/index.js';

/**
 * Tope de idas y vueltas con herramientas dentro de un mismo mensaje del
 * vecino (registrarlo, un save_complaint rechazado, etc.). Evita que un
 * modelo que insiste con la misma llamada inválida gire sin fin.
 */
const MAX_TOOL_ROUNDS = 4;

const ERROR_REPLY = 'Lo siento, ocurrió un error. Por favor intentá de nuevo.';

interface SaveComplaintInput {
  category_id: string;
  subcategory_id?: string;
  description: string;
  location?: string;
  summary: string;
  no_photo_reason?: string;
  confidence: number;
  urgency?: UrgencyLevel;
}

interface RegisterCitizenInput {
  full_name: string;
  /** Opcional si el vecino ya está registrado y solo corrige el nombre */
  dni?: string;
}

interface OutOfScopeInput {
  kind: 'not_municipal' | 'off_topic';
  suggested_authority?: string;
  reason: string;
}

/** Resultado de una herramienta que no cierra el turno: vuelve al modelo. */
type ToolOutcome = { done: false; result: string; isError: boolean } | { done: true };

export async function handleIncomingMessage(
  tenantId: string,
  phoneNumber: string,
  inbound: InboundMessage,
): Promise<void> {
  const session = await getOrCreateSession(tenantId, phoneNumber);
  const context = session.context as SessionContext;
  const userMessage = describeInbound(inbound);
  const echo = understoodPrefix(inbound);

  // La evidencia se acumula en la sesión: la foto y la ubicación suelen llegar
  // en mensajes distintos al de la descripción.
  if (inbound.photos.length > 0) {
    context.collected.photos = [...(context.collected.photos ?? []), ...inbound.photos];
  }
  if (inbound.location) context.collected.pin = inbound.location;

  context.messages.push({ role: 'user', content: userMessage });
  context.attempts += 1;

  await saveMessage(session.id, tenantId, 'user', userMessage);

  let citizen = await getCitizen(tenantId, phoneNumber);

  // Las llamadas a herramientas de este turno viven solo acá. En la sesión se
  // guarda texto plano; lo que resolvieron (vecino registrado, fotos) se le
  // vuelve a dar al modelo por el system prompt en los mensajes siguientes.
  const chat = startChat({
    system: () => buildSystemPrompt(tenantId, context, citizen),
    history: context.messages,
    tools: complaintTools,
  });

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const step = await chat.step();

    if (step.type === 'text') {
      await replyAndRemember(session.id, tenantId, phoneNumber, context, echo + (step.text || ERROR_REPLY));
      return;
    }

    const { call } = step;
    let outcome: ToolOutcome;

    if (call.name === 'register_citizen') {
      const input = call.input as unknown as RegisterCitizenInput;
      const registered = await handleRegisterCitizen(tenantId, phoneNumber, input, citizen);
      if (registered.citizen) citizen = registered.citizen;
      outcome = { done: false, result: registered.message, isError: !registered.citizen };
    } else if (call.name === 'save_complaint') {
      const input = call.input as unknown as SaveComplaintInput;
      const problem =
        missingForComplaint(citizen, context, input) ?? (await invalidCategory(tenantId, input));
      const located = problem ? null : await locateComplaint(tenantId, context, input);
      if (problem) {
        outcome = { done: false, result: problem, isError: true };
      } else if (!located!.ok) {
        outcome = { done: false, result: located!.error, isError: true };
      } else {
        await finishComplaint(tenantId, session.id, phoneNumber, citizen!, context, input, located!.geo, echo);
        outcome = { done: true };
      }
    } else if (call.name === 'check_complaint_status') {
      const code = typeof call.input.code === 'string' ? call.input.code : undefined;
      const status = await describeComplaintStatus(tenantId, phoneNumber, code);
      outcome = { done: false, result: status.text, isError: !status.found };
    } else if (call.name === 'out_of_scope') {
      const input = call.input as unknown as OutOfScopeInput;
      await handleOutOfScope(tenantId, session.id, phoneNumber, input, context, echo);
      outcome = { done: true };
    } else {
      outcome = { done: false, result: `Herramienta desconocida: ${call.name}`, isError: true };
    }

    if (outcome.done) return;
    chat.addToolResult(call, outcome.result, outcome.isError);
  }

  // Se agotaron las vueltas sin una respuesta de texto
  await replyAndRemember(session.id, tenantId, phoneNumber, context, echo + ERROR_REPLY);
}

/** Largo máximo de la cita: un audio de un minuto no se devuelve entero */
const ECHO_MAX_CHARS = 280;

/**
 * Si el vecino mandó un audio, la respuesta arranca citando lo que se
 * transcribió. Así puede corregir si Whisper entendió mal una calle o un
 * número antes de que el reclamo se guarde con ese error. Lo arma el código
 * (no el modelo) para que salga siempre y literal.
 */
function understoodPrefix(inbound: InboundMessage): string {
  if (!inbound.transcript) return '';
  const text =
    inbound.transcript.length > ECHO_MAX_CHARS
      ? `${inbound.transcript.slice(0, ECHO_MAX_CHARS).trimEnd()}…`
      : inbound.transcript;
  return `Entendí: "${text}"\n\n`;
}

async function replyAndRemember(
  sessionId: string,
  tenantId: string,
  phoneNumber: string,
  context: SessionContext,
  text: string,
): Promise<void> {
  context.messages.push({ role: 'assistant', content: text });
  await updateSessionContext(sessionId, context);
  await saveMessage(sessionId, tenantId, 'assistant', text);
  await sendWhatsAppMessage(phoneNumber, text);
}

async function handleRegisterCitizen(
  tenantId: string,
  phoneNumber: string,
  input: RegisterCitizenInput,
  current: Citizen | null,
): Promise<{ citizen: Citizen | null; message: string }> {
  const name = normalizeFullName(input.full_name ?? '');
  if (!name.ok) return { citizen: null, message: name.error };

  // Si ya está registrado y solo corrige el nombre, se conserva su DNI:
  // pedírselo de nuevo por un error de tipeo en el apellido es un paso de más
  const rawDni = input.dni?.trim() || current?.dni || '';
  if (!rawDni) return { citizen: null, message: 'Falta el DNI. Pedíselo al vecino.' };
  const dni = normalizeDni(rawDni);
  if (!dni.ok) return { citizen: null, message: dni.error };

  let citizen: Citizen;
  try {
    citizen = await registerCitizen(tenantId, phoneNumber, name.value, dni.value);
  } catch {
    return {
      citizen: null,
      message: 'Falla del sistema al guardar los datos. Pedile disculpas y que vuelva a escribir en unos minutos.',
    };
  }
  return {
    citizen,
    message: `Vecino registrado como ${citizen.full_name}. Seguí con el reclamo.`,
  };
}

/**
 * Lo que el código exige para guardar, sin depender de que el modelo siga el
 * prompt: vecino identificado y foto (o el motivo de por qué no hay).
 * Devuelve qué falta, o null si está todo.
 */
function missingForComplaint(
  citizen: Citizen | null,
  context: SessionContext,
  input: SaveComplaintInput,
): string | null {
  if (!citizen) {
    return 'No se puede guardar: el vecino no está registrado. Pedile nombre y apellido y DNI, y llamá register_citizen.';
  }
  // Los modelos abiertos a veces llaman la herramienta con campos vacíos
  const missing = (['category_id', 'description', 'summary'] as const).filter(
    (field) => typeof input[field] !== 'string' || !input[field].trim(),
  );
  if (missing.length > 0) {
    return `Faltan campos obligatorios en save_complaint: ${missing.join(', ')}. Completalos y volvé a llamarla.`;
  }
  const hasPhoto = (context.collected.photos?.length ?? 0) > 0;
  if (!hasPhoto && !input.no_photo_reason?.trim()) {
    return 'No se puede guardar sin foto. Pedile una foto del problema; si no puede mandarla, preguntale por qué y pasalo en no_photo_reason.';
  }
  if (!input.location?.trim() && !context.collected.pin) {
    return 'Falta la ubicación. Pedile calle y altura, o que comparta su ubicación por WhatsApp.';
  }
  return null;
}

/**
 * La categoría tiene que ser una de las activas del municipio. Un modelo que
 * inventa o recorta el UUID haría fallar el insert (clave foránea) y el vecino
 * recibiría "tuvimos un problema"; así el modelo se corrige solo.
 */
async function invalidCategory(tenantId: string, input: SaveComplaintInput): Promise<string | null> {
  const { data } = await supabase
    .from('categories')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .eq('id', input.category_id)
    .maybeSingle();
  if (data) return null;
  return 'Ese category_id no existe. Usá exactamente uno de los ids de CATEGORÍAS DISPONIBLES del prompt.';
}

/**
 * Busca la ubicación en el mapa ANTES de guardar, para que el vecino todavía
 * esté en la charla si no se encuentra. Con la ubicación de WhatsApp no hace
 * falta: ya son coordenadas.
 *
 * Si no aparece, se repregunta una sola vez. Si el vecino insiste con la misma
 * (no sabe la calle, no puede compartir ubicación), se guarda igual y queda
 * marcado en el panel como "no se pudo ubicar": nadie se queda sin reclamar.
 * Si falla el servicio de mapas, tampoco se frena: se reintenta después.
 */
async function locateComplaint(
  tenantId: string,
  context: SessionContext,
  input: SaveComplaintInput,
): Promise<{ ok: true; geo: GeocodeResult | null } | { ok: false; error: string }> {
  if (context.collected.pin) return { ok: true, geo: null };

  const location = input.location!.trim();
  const geo = await geocodeAddress(location, await getTenantMapConfig(tenantId));
  if (geo.status !== 'not_found') return { ok: true, geo };

  const alreadyAsked =
    context.collected.unmapped_location?.toLowerCase() === location.toLowerCase();
  if (alreadyAsked) return { ok: true, geo };

  context.collected.unmapped_location = location;
  return {
    ok: false,
    error:
      `No encontré "${location}" en el mapa de la ciudad. Pedile al vecino la calle y altura, ` +
      'una esquina, o que comparta su ubicación (📎 → Ubicación). Si no puede dar otra, volvé a ' +
      'llamar save_complaint con la misma ubicación y se guarda igual, sin marcar en el mapa.',
  };
}

async function finishComplaint(
  tenantId: string,
  sessionId: string,
  phoneNumber: string,
  citizen: Citizen,
  context: SessionContext,
  input: SaveComplaintInput,
  geo: GeocodeResult | null,
  echo: string,
): Promise<void> {
  let confirmMessage: string;
  try {
    const complaintId = await createComplaint(tenantId, sessionId, phoneNumber, citizen, context, input, geo);
    await completeSession(sessionId);

    // Un reclamo válido limpia los avisos previos: la persona usó bien el canal
    await clearStrikes(tenantId, phoneNumber).catch(() => {});

    const firstName = citizen.full_name.split(' ')[0];
    confirmMessage =
      `¡Gracias, ${firstName}! Tu reclamo quedó registrado con el número ` +
      `*${complaintCode(complaintId)}*. Para saber cómo va, escribime cuando quieras ` +
      '"estado de mi reclamo". 🏛️';
  } catch (err) {
    console.error('No se pudo crear el reclamo', err);
    // Sin esto el vecino recibiría "registrado" aunque el reclamo no exista.
    // La sesión sigue activa, así que puede reintentar sin empezar de cero.
    confirmMessage =
      'Tuvimos un problema al registrar tu reclamo. Por favor escribinos de nuevo en unos minutos.';
  }

  await sendWhatsAppMessage(phoneNumber, echo + confirmMessage);
  await saveMessage(sessionId, tenantId, 'assistant', echo + confirmMessage);
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
  echo: string,
): Promise<void> {
  let replyText: string;

  if (input.kind === 'not_municipal') {
    replyText = buildNotMunicipalMessage(input.suggested_authority);
  } else {
    const outcome = await registerOffTopic(tenantId, phoneNumber, input.reason);
    replyText = outcome.message;
  }

  await replyAndRemember(sessionId, tenantId, phoneNumber, context, echo + replyText);
}

async function createComplaint(
  tenantId: string,
  sessionId: string,
  phoneNumber: string,
  citizen: Citizen,
  context: SessionContext,
  input: SaveComplaintInput,
  geo: GeocodeResult | null,
): Promise<string> {
  const photos = context.collected.photos ?? [];
  const pin = context.collected.pin;

  // Ubicación ya resuelta durante la charla: la de WhatsApp o la del mapa.
  // Solo si el servicio de mapas falló queda pendiente para reintentar.
  const coords = pin
    ? {
        latitude: pin.latitude,
        longitude: pin.longitude,
        geocode_status: 'ok',
        geocoded_label: pin.label,
        geocoded_at: new Date().toISOString(),
        location_source: 'whatsapp_pin',
      }
    : geo && geo.status !== 'error'
      ? {
          latitude: geo.latitude ?? null,
          longitude: geo.longitude ?? null,
          geocode_status: geo.status,
          geocoded_label: geo.status === 'ok' ? geo.label ?? null : null,
          geocoded_at: new Date().toISOString(),
          location_source: 'text',
        }
      : { location_source: 'text' };

  const { data, error } = await supabase
    .from('complaints')
    .insert({
      tenant_id: tenantId,
      session_id: sessionId,
      category_id: input.category_id,
      subcategory_id: input.subcategory_id ?? null,
      phone_number: phoneNumber,
      citizen_id: citizen.id,
      complainant_name: citizen.full_name,
      description: input.description,
      location: input.location?.trim() || pin?.label || 'Ubicación compartida por WhatsApp',
      summary: input.summary,
      photos,
      no_photo_reason: photos.length > 0 ? null : input.no_photo_reason ?? null,
      status: 'pending',
      urgency: input.urgency ?? 'medium',
      urgency_source: 'ai',
      ai_confidence: input.confidence,
      raw_classification: input as unknown as Record<string, unknown>,
      ...coords,
    })
    .select('id')
    .single();

  if (error || !data) throw new Error(`No se pudo crear el reclamo: ${error?.message}`);

  if (!('geocode_status' in coords)) {
    // El servicio de mapas falló durante la charla: se reintenta en segundo
    // plano para no demorar más la respuesta de WhatsApp al vecino.
    void geocodeComplaint(data.id, tenantId, input.location).catch(() => {
      /* el reclamo queda en geocode_status='pending' y lo reintenta el backfill */
    });
  }

  return data.id as string;
}
