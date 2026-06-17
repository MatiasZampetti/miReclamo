import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { supabase } from '../services/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import type { JwtPayload } from '../types/index.js';

const updateStatusSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'resolved', 'rejected']),
  status_note: z.string().optional(),
});

export async function complaintsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

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
}
