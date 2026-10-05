/**
 * Backfill de reclamos previos al mapa: les asigna urgencia y coordenadas.
 *
 *   npm run backfill:geo --workspace=apps/api
 *
 * Es idempotente: solo toca reclamos a los que les falta el dato.
 * Pasale --force para volver a geocodificar los que fallaron antes.
 */
import '../config/env.js';
import { env } from '../config/env.js';
import { supabase } from '../services/supabase.js';
import { geocodeComplaint, getTenantMapConfig } from '../services/complaint-geo.js';
import { complete } from '../services/ai/llm.js';
import type { UrgencyLevel } from '../types/index.js';

const force = process.argv.includes('--force');

const URGENCY_PROMPT = `Sos un clasificador de reclamos municipales. Para cada reclamo, devolvé su grado de urgencia según el RIESGO PARA LAS PERSONAS:

- "high": peligro inmediato (cables sueltos, poste caído, semáforo roto, pérdida de gas, calle intransitable, riesgo eléctrico).
- "medium": afecta circulación o salubridad sin peligro inmediato (bache, contenedor desbordado, luminaria apagada, basura acumulada).
- "low": mantenimiento o estético (poda, pintura, pasto alto, mantenimiento de plaza).

Respondé ÚNICAMENTE con un JSON array del tipo [{"id":"<uuid>","urgency":"high|medium|low"}], sin texto adicional.`;

async function classifyUrgency(
  complaints: Array<{ id: string; summary: string; description: string; category?: { name: string } | null }>,
): Promise<Map<string, UrgencyLevel>> {
  const listado = complaints
    .map((c) => `- id: ${c.id}\n  categoría: ${c.category?.name ?? 'sin categoría'}\n  resumen: ${c.summary}\n  descripción: ${c.description}`)
    .join('\n');

  const raw = (await complete(URGENCY_PROMPT, `Clasificá estos reclamos:\n\n${listado}`)) || '[]';
  const json = raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1);

  const map = new Map<string, UrgencyLevel>();
  try {
    for (const item of JSON.parse(json) as Array<{ id: string; urgency: UrgencyLevel }>) {
      if (['high', 'medium', 'low'].includes(item.urgency)) map.set(item.id, item.urgency);
    }
  } catch {
    console.error('  No se pudo parsear la respuesta de la IA, se usa "medium" por defecto');
  }
  return map;
}

async function main() {
  const tenantId = env.DEFAULT_TENANT_ID;
  const cfg = await getTenantMapConfig(tenantId);

  if (cfg.centerLat == null) {
    console.error('El tenant no tiene centro de mapa configurado. ¿Corriste la migración 002?');
    process.exit(1);
  }
  console.log(`Municipio: ${cfg.city ?? '(sin ciudad)'} — centro ${cfg.centerLat}, ${cfg.centerLng}\n`);

  const { data: complaints, error } = await supabase
    .from('complaints')
    .select('id, summary, description, location, urgency, latitude, geocode_status, category:categories(name)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error leyendo reclamos:', error.message);
    process.exit(1);
  }
  if (!complaints?.length) {
    console.log('No hay reclamos para procesar.');
    return;
  }

  type Row = (typeof complaints)[number] & { category?: { name: string } | null };
  const rows = complaints as unknown as Row[];

  // ── 1. Urgencia ────────────────────────────────────────────────
  const sinUrgencia = rows.filter((c) => !c.urgency);
  if (sinUrgencia.length) {
    console.log(`Clasificando urgencia de ${sinUrgencia.length} reclamo(s)...`);
    const urgencias = await classifyUrgency(sinUrgencia);
    for (const c of sinUrgencia) {
      const urgency = urgencias.get(c.id) ?? 'medium';
      await supabase
        .from('complaints')
        .update({ urgency, urgency_source: 'ai' })
        .eq('id', c.id);
      console.log(`  [${urgency.padEnd(6)}] ${c.summary.slice(0, 60)}`);
    }
  } else {
    console.log('Todos los reclamos ya tienen urgencia.');
  }

  // ── 2. Geocodificación ─────────────────────────────────────────
  const sinCoords = rows.filter(
    (c) => c.latitude == null && c.location && (force || c.geocode_status !== 'not_found'),
  );

  console.log(`\nGeocodificando ${sinCoords.length} reclamo(s) (1 req/seg por política de Nominatim)...`);
  let ok = 0;
  for (const c of sinCoords) {
    await geocodeComplaint(c.id, tenantId, c.location);
    const { data } = await supabase
      .from('complaints')
      .select('latitude, longitude, geocode_status, geocoded_label')
      .eq('id', c.id)
      .single();

    if (data?.geocode_status === 'ok') {
      ok++;
      console.log(`  ✓ "${c.location}" → ${data.latitude?.toFixed(5)}, ${data.longitude?.toFixed(5)}`);
    } else {
      console.log(`  ✗ "${c.location}" → ${data?.geocode_status}`);
    }
  }

  const sinDireccion = rows.filter((c) => !c.location).length;
  console.log(`\nListo: ${ok}/${sinCoords.length} ubicados en el mapa.`);
  if (sinDireccion) console.log(`${sinDireccion} reclamo(s) no tienen dirección cargada.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
