import { supabase } from './supabase.js';
import { geocodeAddress, type GeocodeContext } from './geocoding.js';

/** Config de mapa del municipio, cacheada en memoria (cambia muy rara vez). */
const tenantCache = new Map<string, GeocodeContext & { defaultZoom: number }>();

export async function getTenantMapConfig(tenantId: string) {
  const cached = tenantCache.get(tenantId);
  if (cached) return cached;

  const { data } = await supabase
    .from('tenants')
    .select('city, center_lat, center_lng, default_zoom')
    .eq('id', tenantId)
    .single();

  const config = {
    city: data?.city ?? null,
    centerLat: data?.center_lat ?? null,
    centerLng: data?.center_lng ?? null,
    defaultZoom: data?.default_zoom ?? 14,
  };

  tenantCache.set(tenantId, config);
  return config;
}

/**
 * Geocodifica un reclamo y guarda el resultado.
 * Pensado para correr en segundo plano: nunca lanza, solo registra el estado.
 */
export async function geocodeComplaint(
  complaintId: string,
  tenantId: string,
  location: string | null | undefined,
): Promise<void> {
  const ctx = await getTenantMapConfig(tenantId);
  const result = await geocodeAddress(location, ctx);

  await supabase
    .from('complaints')
    .update({
      latitude: result.latitude ?? null,
      longitude: result.longitude ?? null,
      geocode_status: result.status,
      geocoded_label: result.status === 'ok' ? result.label ?? null : null,
      geocoded_at: new Date().toISOString(),
    })
    .eq('id', complaintId)
    .eq('tenant_id', tenantId);
}
