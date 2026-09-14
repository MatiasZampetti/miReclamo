import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { supabase } from '../services/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { geocodeComplaint } from '../services/complaint-geo.js';
import { sendWhatsAppMessage } from '../services/twilio.js';
import { unblockPhone } from '../services/moderation.js';
import { saveMessage } from '../services/sessions.js';
import {
  getConversationMode,
  setConversationMode,
  isWindowOpen,
  windowExpiresAt,
} from '../services/conversation-mode.js';
import type { JwtPayload } from '../types/index.js';

const updateStatusSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'resolved', 'rejected']),
  status_note: z.string().optional(),
});

const updateUrgencySchema = z.object({
  urgency: z.enum(['high', 'medium', 'low']),
});

const replySchema = z.object({
  content: z.string().trim().min(1, 'El mensaje no puede estar vacío').max(1500),
});

/**
 * 42703 = undefined_column en Postgres. Si falta alguna columna del mapa es
 * porque no se aplicó la migración 002; conviene decirlo en lugar de propagar
 * el error crudo de la base.
 */
const MIGRATION_HINT =
  'Faltan las columnas del mapa. Aplicá supabase/migrations/002_map_and_urgency.sql en el SQL Editor de Supabase.';

function isMissingColumn(error: { code?: string } | null): boolean {
  return error?.code === '42703';
}

export async function complaintsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  // GET /api/complaints/map — solo reclamos geolocalizados, payload liviano
  app.get('/map', async (request, reply) => {
    const user = request.user as JwtPayload;
    const query = request.query as {
      status?: string;
      category_id?: string;
      urgency?: string;
      from?: string;
      to?: string;
    };

    let q = supabase
      .from('complaints')
      .select(
        `id, summary, location, status, urgency, latitude, longitude,
         created_at, complainant_name,
         category:categories(id, name)`,
      )
      .eq('tenant_id', user.tenant_id)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (query.status) q = q.eq('status', query.status);
    if (query.category_id) q = q.eq('category_id', query.category_id);
    if (query.urgency) q = q.eq('urgency', query.urgency);
    if (query.from) q = q.gte('created_at', query.from);
    if (query.to) q = q.lte('created_at', query.to);

    const { data, error } = await q;
    if (isMissingColumn(error)) {
      return reply.status(503).send({ error: MIGRATION_HINT, code: 'MIGRATION_REQUIRED' });
    }
    if (error) return reply.status(500).send({ error: error.message });

    // Cuántos reclamos quedaron fuera del mapa por no tener coordenadas
    const { count: unmapped } = await supabase
      .from('complaints')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', user.tenant_id)
      .is('latitude', null);

    return reply.send({ data: data ?? [], unmapped: unmapped ?? 0 });
  });

  // GET /api/complaints — listado con filtros
  app.get('/', async (request, reply) => {
    const user = request.user as JwtPayload;
    const query = request.query as {
      status?: string;
      category_id?: string;
      from?: string;
      to?: string;
      page?: string;
      limit?: string;
    };

    const page = parseInt(query.page ?? '1');
    const limit = Math.min(parseInt(query.limit ?? '20'), 100);
    const offset = (page - 1) * limit;

    let q = supabase
      .from('complaints')
      .select(
        `*,
        category:categories(id, name),
        subcategory:subcategories(id, name)`,
        { count: 'exact' },
      )
      .eq('tenant_id', user.tenant_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (query.status) q = q.eq('status', query.status);
    if (query.category_id) q = q.eq('category_id', query.category_id);
    if (query.from) q = q.gte('created_at', query.from);
    if (query.to) q = q.lte('created_at', query.to);

    const { data, error, count } = await q;
    if (error) return reply.status(500).send({ error: error.message });

    return reply.send({
      data,
      pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) },
    });
  });

  // GET /api/complaints/:id
  app.get('/:id', async (request, reply) => {
    const user = request.user as JwtPayload;
    const { id } = request.params as { id: string };

    const { data, error } = await supabase
      .from('complaints')
      .select('*, category:categories(id, name), subcategory:subcategories(id, name)')
      .eq('id', id)
      .eq('tenant_id', user.tenant_id)
      .single();

    if (error || !data) return reply.status(404).send({ error: 'Reclamo no encontrado' });
    return reply.send(data);
  });

  // GET /api/complaints/:id/messages — historial de chat
  app.get('/:id/messages', async (request, reply) => {
    const user = request.user as JwtPayload;
    const { id } = request.params as { id: string };

    // Verificar que el reclamo pertenece al tenant
    const { data: complaint } = await supabase
      .from('complaints')
      .select('session_id')
      .eq('id', id)
      .eq('tenant_id', user.tenant_id)
      .single();

    if (!complaint?.session_id) return reply.send([]);

    const { data: messages } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', complaint.session_id)
      .order('created_at', { ascending: true });

    return reply.send(messages ?? []);
  });

  // PATCH /api/complaints/:id/status
  app.patch('/:id/status', async (request, reply) => {
    const user = request.user as JwtPayload;
    const { id } = request.params as { id: string };

    const body = updateStatusSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Datos inválidos' });

    const update: Record<string, unknown> = { status: body.data.status };
    if (body.data.status_note) update.status_note = body.data.status_note;
    if (body.data.status === 'resolved') update.resolved_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('complaints')
      .update(update)
      .eq('id', id)
      .eq('tenant_id', user.tenant_id)
      .select()
      .single();

    if (error || !data) return reply.status(404).send({ error: 'Reclamo no encontrado' });
    return reply.send(data);
  });

  // PATCH /api/complaints/:id/urgency — override manual de la urgencia que puso la IA
  app.patch('/:id/urgency', async (request, reply) => {
    const user = request.user as JwtPayload;
    const { id } = request.params as { id: string };

    const body = updateUrgencySchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Urgencia inválida' });

    const { data, error } = await supabase
      .from('complaints')
      .update({ urgency: body.data.urgency, urgency_source: 'manual' })
      .eq('id', id)
      .eq('tenant_id', user.tenant_id)
      .select('*, category:categories(id, name), subcategory:subcategories(id, name)')
      .single();

    if (isMissingColumn(error)) {
      return reply.status(503).send({ error: MIGRATION_HINT, code: 'MIGRATION_REQUIRED' });
    }
    if (error || !data) return reply.status(404).send({ error: 'Reclamo no encontrado' });
    return reply.send(data);
  });

  // ── Toma de control humana de la conversación ──────────────────

  /** Busca el reclamo y valida que sea del tenant. */
  async function findComplaint(id: string, tenantId: string) {
    const { data } = await supabase
      .from('complaints')
      .select('id, phone_number, session_id, complainant_name')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();
    return data;
  }

  /** Estado de la conversación tal como lo necesita el panel. */
  async function conversationState(tenantId: string, phoneNumber: string) {
    const row = await getConversationMode(tenantId, phoneNumber);
    const lastInbound = row?.last_inbound_at ?? null;
    return {
      mode: row?.mode ?? ('agent' as const),
      taken_over_by: row?.taken_over_by ?? null,
      taken_over_at: row?.taken_over_at ?? null,
      last_inbound_at: lastInbound,
      window_expires_at: windowExpiresAt(lastInbound),
      // WhatsApp solo admite texto libre dentro de las 24 h del último entrante
      window_open: isWindowOpen(lastInbound),
      offtopic_strikes: row?.offtopic_strikes ?? 0,
      blocked: Boolean(row?.blocked_at),
      blocked_at: row?.blocked_at ?? null,
      blocked_reason: row?.blocked_reason ?? null,
    };
  }

  // GET /api/complaints/:id/conversation — quién atiende y si se puede escribir
  app.get('/:id/conversation', async (request, reply) => {
    const user = request.user as JwtPayload;
    const { id } = request.params as { id: string };

    const complaint = await findComplaint(id, user.tenant_id);
    if (!complaint) return reply.status(404).send({ error: 'Reclamo no encontrado' });

    return reply.send(await conversationState(user.tenant_id, complaint.phone_number));
  });

  // POST /api/complaints/:id/takeover — el admin toma la conversación
  app.post('/:id/takeover', async (request, reply) => {
    const user = request.user as JwtPayload;
    const { id } = request.params as { id: string };

    const complaint = await findComplaint(id, user.tenant_id);
    if (!complaint) return reply.status(404).send({ error: 'Reclamo no encontrado' });

    await setConversationMode(user.tenant_id, complaint.phone_number, 'human', {
      sessionId: complaint.session_id,
      complaintId: complaint.id,
      adminId: user.sub,
    });

    return reply.send(await conversationState(user.tenant_id, complaint.phone_number));
  });

  // POST /api/complaints/:id/release — devuelve la conversación al agente IA
  app.post('/:id/release', async (request, reply) => {
    const user = request.user as JwtPayload;
    const { id } = request.params as { id: string };

    const complaint = await findComplaint(id, user.tenant_id);
    if (!complaint) return reply.status(404).send({ error: 'Reclamo no encontrado' });

    await setConversationMode(user.tenant_id, complaint.phone_number, 'agent');
    return reply.send(await conversationState(user.tenant_id, complaint.phone_number));
  });

  // POST /api/complaints/:id/unblock — devuelve el acceso a un número bloqueado
  app.post('/:id/unblock', async (request, reply) => {
    const user = request.user as JwtPayload;
    const { id } = request.params as { id: string };

    const complaint = await findComplaint(id, user.tenant_id);
    if (!complaint) return reply.status(404).send({ error: 'Reclamo no encontrado' });

    await unblockPhone(user.tenant_id, complaint.phone_number, user.sub);
    return reply.send(await conversationState(user.tenant_id, complaint.phone_number));
  });

  // POST /api/complaints/:id/reply — el admin le escribe al vecino por WhatsApp
  app.post('/:id/reply', async (request, reply) => {
    const user = request.user as JwtPayload;
    const { id } = request.params as { id: string };

    const body = replySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message ?? 'Mensaje inválido' });
    }

    const complaint = await findComplaint(id, user.tenant_id);
    if (!complaint) return reply.status(404).send({ error: 'Reclamo no encontrado' });

    const state = await conversationState(user.tenant_id, complaint.phone_number);

    // Escribir con el agente activo mezclaría las dos voces en el mismo chat
    if (state.mode !== 'human') {
      return reply.status(409).send({
        error: 'Primero tenés que activar el modo humano para escribirle al vecino.',
        code: 'AGENT_MODE_ACTIVE',
      });
    }

    if (!state.window_open) {
      return reply.status(422).send({
        error:
          'Pasaron más de 24 h desde el último mensaje del vecino. WhatsApp no permite texto ' +
          'libre fuera de esa ventana: hace falta que él vuelva a escribir o usar una plantilla aprobada.',
        code: 'WHATSAPP_WINDOW_CLOSED',
      });
    }

    try {
      await sendWhatsAppMessage(complaint.phone_number, body.data.content);
    } catch (err) {
      const twilioCode = (err as { code?: number }).code;
      request.log.error({ err, twilioCode }, 'Error enviando WhatsApp');
      return reply.status(502).send({
        error:
          twilioCode === 63016
            ? 'WhatsApp rechazó el mensaje por estar fuera de la ventana de 24 h.'
            : `No se pudo enviar el mensaje${twilioCode ? ` (Twilio ${twilioCode})` : ''}.`,
        code: 'SEND_FAILED',
      });
    }

    // Se guarda recién después de que Twilio lo aceptó, para que el hilo del
    // panel refleje lo que realmente le llegó al vecino.
    const sessionId = complaint.session_id;
    if (sessionId) {
      await saveMessage(sessionId, user.tenant_id, 'admin', body.data.content, user.sub);
    }

    return reply.send({ ok: true, sent_at: new Date().toISOString() });
  });

  // POST /api/complaints/:id/geocode — reintenta ubicar el reclamo en el mapa
  app.post('/:id/geocode', async (request, reply) => {
    const user = request.user as JwtPayload;
    const { id } = request.params as { id: string };

    const { data: complaint } = await supabase
      .from('complaints')
      .select('id, location')
      .eq('id', id)
      .eq('tenant_id', user.tenant_id)
      .single();

    if (!complaint) return reply.status(404).send({ error: 'Reclamo no encontrado' });

    await geocodeComplaint(complaint.id, user.tenant_id, complaint.location);

    const { data } = await supabase
      .from('complaints')
      .select('*, category:categories(id, name), subcategory:subcategories(id, name)')
      .eq('id', id)
      .single();

    return reply.send(data);
  });
}
