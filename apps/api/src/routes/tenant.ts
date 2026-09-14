import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { getTenantMapConfig } from '../services/complaint-geo.js';
import type { JwtPayload } from '../types/index.js';

// Fallback si el municipio todavía no tiene configurado su centro
const FALLBACK = { city: null, centerLat: -31.5540883, centerLng: -63.5352431, defaultZoom: 14 };

export async function tenantRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  // GET /api/tenant/map-config — centro y zoom inicial del mapa
  app.get('/map-config', async (request, reply) => {
    const user = request.user as JwtPayload;
    const config = await getTenantMapConfig(user.tenant_id);

    return reply.send({
      city: config.city ?? FALLBACK.city,
      center_lat: config.centerLat ?? FALLBACK.centerLat,
      center_lng: config.centerLng ?? FALLBACK.centerLng,
      default_zoom: config.defaultZoom ?? FALLBACK.defaultZoom,
    });
  });
}
