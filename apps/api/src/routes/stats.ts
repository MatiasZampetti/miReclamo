import type { FastifyInstance } from 'fastify';
import { supabase } from '../services/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import type { JwtPayload } from '../types/index.js';

export async function statsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  // GET /api/stats/summary
  app.get('/summary', async (request, reply) => {
    const user = request.user as JwtPayload;

    const { data: complaints } = await supabase
      .from('complaints')
      .select('status, resolved_at, created_at')
      .eq('tenant_id', user.tenant_id);

    const all = complaints ?? [];
    const byStatus = {
      pending: 0,
      in_progress: 0,
      resolved: 0,
      rejected: 0,
    };

    let totalResolutionMs = 0;
    let resolvedCount = 0;

    for (const c of all) {
      byStatus[c.status as keyof typeof byStatus] = (byStatus[c.status as keyof typeof byStatus] ?? 0) + 1;
      if (c.status === 'resolved' && c.resolved_at) {
        totalResolutionMs += new Date(c.resolved_at).getTime() - new Date(c.created_at).getTime();
        resolvedCount++;
      }
    }

    return reply.send({
      total: all.length,
      by_status: byStatus,
      resolution_time_avg_hours:
        resolvedCount > 0
          ? Math.round(totalResolutionMs / resolvedCount / 1000 / 3600 * 10) / 10
          : null,
    });
  });

  // GET /api/stats/categories
  app.get('/categories', async (request, reply) => {
    const user = request.user as JwtPayload;

    const { data } = await supabase
      .from('complaints')
      .select('category_id, categories(name)')
      .eq('tenant_id', user.tenant_id);

    const counts: Record<string, { name: string; count: number }> = {};
    for (const c of data ?? []) {
      const catId = c.category_id;
      const catName = (c.categories as unknown as { name: string } | null)?.name ?? catId;
      if (!counts[catId]) counts[catId] = { name: catName, count: 0 };
      counts[catId].count++;
    }

    return reply.send(Object.entries(counts).map(([id, v]) => ({ id, ...v })));
  });

  // GET /api/stats/timeline?from=&to=&group_by=day|week|month
  app.get('/timeline', async (request, reply) => {
    const user = request.user as JwtPayload;
    const query = request.query as { from?: string; to?: string; group_by?: string };

    let q = supabase
      .from('complaints')
      .select('created_at')
      .eq('tenant_id', user.tenant_id)
      .order('created_at');

    if (query.from) q = q.gte('created_at', query.from);
    if (query.to) q = q.lte('created_at', query.to);

    const { data } = await q;

    const groupBy = query.group_by ?? 'day';
    const counts: Record<string, number> = {};

    for (const c of data ?? []) {
      const date = new Date(c.created_at);
      let key: string;
      if (groupBy === 'month') {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else if (groupBy === 'week') {
        const monday = new Date(date);
        monday.setDate(date.getDate() - date.getDay() + 1);
        key = monday.toISOString().slice(0, 10);
      } else {
        key = date.toISOString().slice(0, 10);
      }
      counts[key] = (counts[key] ?? 0) + 1;
    }

    return reply.send(
      Object.entries(counts)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count })),
    );
  });
}
