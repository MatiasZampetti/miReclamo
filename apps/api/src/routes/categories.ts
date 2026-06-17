import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { supabase } from '../services/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import type { JwtPayload } from '../types/index.js';

const categorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().optional(),
});

const subcategorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().optional(),
});

export async function categoriesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  // GET /api/categories — con subcategorías anidadas
  app.get('/', async (request, reply) => {
    const user = request.user as JwtPayload;

    const { data, error } = await supabase
      .from('categories')
      .select('*, subcategories(*)')
      .eq('tenant_id', user.tenant_id)
      .order('sort_order');

    if (error) return reply.status(500).send({ error: error.message });
    return reply.send(data);
  });

  // POST /api/categories
  app.post('/', async (request, reply) => {
    const user = request.user as JwtPayload;
    const body = categorySchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Datos inválidos' });

    const { data, error } = await supabase
      .from('categories')
      .insert({ ...body.data, tenant_id: user.tenant_id })
      .select()
      .single();

    if (error) return reply.status(400).send({ error: error.message });
    return reply.status(201).send(data);
  });

  // PATCH /api/categories/:id
  app.patch('/:id', async (request, reply) => {
    const user = request.user as JwtPayload;
    const { id } = request.params as { id: string };
    const body = categorySchema.partial().safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Datos inválidos' });

    const { data, error } = await supabase
      .from('categories')
      .update(body.data)
      .eq('id', id)
      .eq('tenant_id', user.tenant_id)
      .select()
      .single();

    if (error || !data) return reply.status(404).send({ error: 'Categoría no encontrada' });
    return reply.send(data);
  });

  // DELETE /api/categories/:id
  app.delete('/:id', async (request, reply) => {
    const user = request.user as JwtPayload;
    const { id } = request.params as { id: string };

    const { count } = await supabase
      .from('complaints')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', id);

    if ((count ?? 0) > 0) {
      return reply.status(400).send({
        error: 'No se puede eliminar una categoría con reclamos asociados',
        code: 'CATEGORY_HAS_COMPLAINTS',
      });
    }

    await supabase.from('categories').delete().eq('id', id).eq('tenant_id', user.tenant_id);
    return reply.status(204).send();
  });

  // POST /api/categories/:id/subcategories
  app.post('/:id/subcategories', async (request, reply) => {
    const user = request.user as JwtPayload;
    const { id: categoryId } = request.params as { id: string };
    const body = subcategorySchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Datos inválidos' });

    const { data, error } = await supabase
      .from('subcategories')
      .insert({ ...body.data, category_id: categoryId, tenant_id: user.tenant_id })
      .select()
      .single();

    if (error) return reply.status(400).send({ error: error.message });
    return reply.status(201).send(data);
  });

  // PATCH /api/categories/:id/subcategories/:subId
  app.patch('/:id/subcategories/:subId', async (request, reply) => {
    const user = request.user as JwtPayload;
    const { subId } = request.params as { id: string; subId: string };
    const body = subcategorySchema.partial().safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Datos inválidos' });

    const { data, error } = await supabase
      .from('subcategories')
      .update(body.data)
      .eq('id', subId)
      .eq('tenant_id', user.tenant_id)
      .select()
      .single();

    if (error || !data) return reply.status(404).send({ error: 'Subcategoría no encontrada' });
    return reply.send(data);
  });

  // DELETE /api/categories/:id/subcategories/:subId
  app.delete('/:id/subcategories/:subId', async (request, reply) => {
    const user = request.user as JwtPayload;
    const { subId } = request.params as { id: string; subId: string };

    await supabase.from('subcategories').delete().eq('id', subId).eq('tenant_id', user.tenant_id);
    return reply.status(204).send();
  });
}
