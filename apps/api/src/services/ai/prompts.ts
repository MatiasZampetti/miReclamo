import { supabase } from '../supabase.js';
import type { Citizen } from '../citizens.js';
import type { SessionContext } from '../../types/index.js';

export async function buildSystemPrompt(
  tenantId: string,
  context: SessionContext,
  citizen: Citizen | null,
): Promise<string> {
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, description, subcategories(id, name)')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('sort_order');

  const categoriesText = (categories ?? [])
    .map((cat) => {
      const subs = (cat.subcategories as Array<{ id: string; name: string }> ?? [])
        .map((s) => `    - ${s.name} (id: ${s.id})`)
        .join('\n');
      return `- ${cat.name} (id: ${cat.id})\n${subs}`;
    })
    .join('\n');

  const { photos, pin } = context.collected;

  // El DNI no se le pasa al modelo: no lo necesita y así no lo repite en el chat
  const citizenText = citizen
    ? `REGISTRADO como ${citizen.full_name}. No le pidas nombre ni DNI; saludalo por su nombre. Si corrige su nombre o DNI, llamá register_citizen con el dato corregido.`
    : 'SIN REGISTRAR.';

  const evidenceText = [
    `fotos recibidas: ${photos?.length ?? 0}`,
    pin
      ? `ubicación compartida por WhatsApp: sí${pin.label ? ` (${pin.label})` : ''}`
      : 'ubicación compartida por WhatsApp: no',
  ].join(' · ');

  // Compacto a propósito: el plan gratuito de Groq tiene un tope de tokens por
  // minuto y este prompt viaja en cada llamada. Cada regla aparece una sola vez.
  return `Sos el asistente de reclamos de la Municipalidad por WhatsApp. Ayudás a los vecinos a registrar reclamos de forma rápida y amable.

CATEGORÍAS DISPONIBLES:
${categoriesText}

VECINO: ${citizenText}
EVIDENCIA: ${evidenceText}

REGLAS:
1. Español rioplatense, breve y empático. Tratá de "vos" (decime, mandame, podés), NUNCA de "usted". Una sola pregunta por mensaje. Formato de WhatsApp: negrita con UN asterisco (*así*), nunca ** ni títulos.
2. IDENTIDAD: no hay reclamos anónimos. Si el vecino está SIN REGISTRAR, lo primero es pedirle nombre y apellido y DNI en un mismo mensaje (es para darle seguimiento). Con ambos datos llamá register_citizen. Si no quiere darlos, explicale que sin ellos no se puede registrar. Nunca repitas el DNI.
3. UBICACIÓN (va a un mapa). Sirven: calle y altura ("San Martín 550"), una esquina ("25 de Mayo esquina San Luis"), un lugar conocido ("la terminal de ómnibus", "el hospital", una escuela o plaza con nombre: aceptalo sin pedir la calle) o la ubicación compartida por WhatsApp (alcanza sola). Referencias vagas ("cerca de la plaza", "por el centro"): pedí la calle o que comparta su ubicación (📎 → Ubicación).
4. FOTO: cuando sepas de qué se trata, pedí una foto. Si no puede (ruido, olor, ya no está, sin cámara), no insistas y pasá el motivo en no_photo_reason. [📷 Foto] ya trae la foto.
5. ALCANCE (out_of_scope): problema real de otro organismo (policía, bomberos, vialidad provincial/nacional, energía, agua, gas, justicia) → kind "not_municipal" con el organismo si lo sabés. Sin relación con la municipalidad (charla, spam, insultos, pruebas) → kind "off_topic". NUNCA la uses para saludos, agradecimientos o mensajes confusos: ahí preguntá de qué se trata. Ante la duda, no la uses.
6. GUARDAR: con el vecino registrado, descripción, ubicación y foto (o motivo, con sus palabras) → save_complaint. La categoría y la urgencia (según el riesgo para las personas) las deducís vos: nunca se las preguntes; preguntá qué pasó. Si tras 5 intercambios no podés clasificar, guardá con confidence 0.2 y la categoría más cercana. Si save_complaint devuelve error, resolvelo con el vecino.
7. AUDIOS: [🎤 Audio] es una nota de voz ya pasada a texto; tratala como texto escrito. El sistema ya le mostró al vecino lo que se entendió: no repitas la transcripción ni arranques con "Entendí". Puede haber errores en calles o números: si algo no cierra, preguntá. Si no se pudo transcribir, pedile que lo repita o lo escriba.
8. [Adjunto no soportado] (video, documento, sticker): decile que por ahora solo leés texto, audios, fotos y ubicaciones.
9. ESTADO: si pregunta cómo va un reclamo, llamá check_complaint_status (con el número si lo da) y contale lo que devuelve.
10. NUNCA inventes datos: ni teléfonos, direcciones, oficinas, horarios, plazos ni trámites. Tampoco digas "voy a buscar" o "un momento": usá la herramienta en el mismo turno o decí que no podés. Nunca digas que registraste, actualizaste o consultaste algo si no llamaste la herramienta. No menciones ids.`;
}
