/**
 * Geocodificación de direcciones vía Nominatim (OpenStreetMap).
 *
 * Nominatim es gratuito y sin API key, pero su política de uso exige:
 *   - máximo 1 request por segundo
 *   - un User-Agent identificatorio real
 * Por eso todas las consultas pasan por una cola serializada.
 * Ref: https://operations.osmfoundation.org/policies/nominatim/
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'miReclamo/1.0 (gestion de reclamos municipales)';
const MIN_INTERVAL_MS = 1100;

export interface GeocodeResult {
  status: 'ok' | 'not_found' | 'error';
  latitude?: number;
  longitude?: number;
  label?: string;
}

export interface GeocodeContext {
  /** Ciudad del tenant, ej. "Villa del Rosario, Córdoba, Argentina" */
  city?: string | null;
  /** Centro del tenant, para acotar la búsqueda a su zona */
  centerLat?: number | null;
  centerLng?: number | null;
}

// ── Cola: garantiza 1 request por segundo hacia Nominatim ──────────
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  // La cola avanza recién después del intervalo mínimo, pase lo que pase
  queue = run.then(
    () => sleep(MIN_INTERVAL_MS),
    () => sleep(MIN_INTERVAL_MS),
  );
  return run;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Normaliza cómo escriben las direcciones los vecinos por WhatsApp.
 * Devuelve variantes ordenadas de más específica a más general.
 */
function buildVariants(address: string, city?: string | null): string[] {
  const clean = address.trim().replace(/\s+/g, ' ');
  const variants: string[] = [];

  // "25 de Mayo esquina San Luis" / "Belgrano y Sarmiento" → intersección
  const intersection = clean.match(
    /^(.+?)\s+(?:esquina|esq\.?|y|casi|intersecci[oó]n con)\s+(.+)$/i,
  );
  if (intersection) {
    const [, a, b] = intersection;
    variants.push(`${a.trim()} & ${b.trim()}`);
    variants.push(a.trim()); // fallback: solo la calle principal
  } else {
    variants.push(clean);
    // "San Martín 550" → "San Martín" si el número no existe en OSM
    const withoutNumber = clean.replace(/\s+\d+\s*$/, '').trim();
    if (withoutNumber && withoutNumber !== clean) variants.push(withoutNumber);
  }

  // Lugares conocidos: "la terminal de ómnibus de Villa del Rosario" → "terminal"
  const place = simplifyPlace(clean, city);
  if (place && !variants.some((v) => v.toLowerCase() === place.toLowerCase())) {
    variants.push(place);
  }

  return variants;
}

/**
 * Los vecinos nombran los lugares distinto de como están en OpenStreetMap:
 * "la terminal de ómnibus" está cargada como "Terminal Villa del Rosario".
 * Se sacan el artículo inicial, los calificativos de transporte y la mención
 * de la ciudad (que ya se agrega aparte a la consulta).
 */
function simplifyPlace(text: string, city?: string | null): string {
  let place = text;
  const cityName = city?.split(',')[0]?.trim();
  if (cityName) {
    // Sin regex armada con el nombre: así no hace falta escapar nada
    const at = place.toLowerCase().indexOf(cityName.toLowerCase());
    if (at >= 0) {
      place = place.slice(0, at).replace(/\s+(?:de|en)\s*$/i, '') + place.slice(at + cityName.length);
    }
  }
  return place
    .replace(/^(?:en\s+)?(?:la|el|los|las)\s+/i, '')
    .replace(/\s+de\s+(?:[óo]mnibus|colectivos|micros|buses)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function query(
  q: string,
  ctx: GeocodeContext,
  bounded: boolean,
): Promise<GeocodeResult | null> {
  const params = new URLSearchParams({
    q: ctx.city ? `${q}, ${ctx.city}` : q,
    format: 'jsonv2',
    limit: '1',
    countrycodes: 'ar',
    addressdetails: '0',
  });

  // Acota a ~8km alrededor del centro del municipio para evitar que
  // "San Martín 550" caiga en otra provincia.
  if (bounded && ctx.centerLat != null && ctx.centerLng != null) {
    const d = 0.08;
    params.set(
      'viewbox',
      [ctx.centerLng - d, ctx.centerLat + d, ctx.centerLng + d, ctx.centerLat - d].join(','),
    );
    params.set('bounded', '1');
  }

  const res = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'es' },
  });

  if (!res.ok) throw new Error(`Nominatim respondió ${res.status}`);

  const results = (await res.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
  }>;

  if (!results.length) return null;

  const [hit] = results;
  return {
    status: 'ok',
    latitude: parseFloat(hit.lat),
    longitude: parseFloat(hit.lon),
    label: hit.display_name,
  };
}

/**
 * Convierte una dirección libre en coordenadas.
 * Prueba variantes acotadas al municipio y, si no encuentra nada, afloja el filtro.
 */
export async function geocodeAddress(
  address: string | null | undefined,
  ctx: GeocodeContext = {},
): Promise<GeocodeResult> {
  if (!address || !address.trim()) return { status: 'not_found' };

  const variants = buildVariants(address, ctx.city);

  try {
    // 1ª pasada: acotada al municipio (evita falsos positivos lejanos)
    for (const variant of variants) {
      const hit = await enqueue(() => query(variant, ctx, true));
      if (hit) return hit;
    }
    // 2ª pasada: sin bounding box, confiando en el texto de la ciudad
    for (const variant of variants) {
      const hit = await enqueue(() => query(variant, ctx, false));
      if (hit) return hit;
    }
    return { status: 'not_found' };
  } catch (err) {
    return { status: 'error', label: err instanceof Error ? err.message : String(err) };
  }
}
