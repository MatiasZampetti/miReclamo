import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { supabase } from '../services/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function authRoutes(app: FastifyInstance) {
  // Login es el blanco obvio de fuerza bruta: techo mucho más bajo que el global.
  app.post('/login', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const body = loginSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Datos inválidos', code: 'VALIDATION_ERROR' });
    }

    const { email, password } = body.data;

    const { data: user, error } = await supabase
      .from('admin_users')
      .select('id, email, name, role, tenant_id, password_hash')
      .eq('email', email)
      .single();

    if (error || !user) {
      return reply.status(401).send({ error: 'Credenciales incorrectas', code: 'INVALID_CREDENTIALS' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return reply.status(401).send({ error: 'Credenciales incorrectas', code: 'INVALID_CREDENTIALS' });
    }

    const token = app.jwt.sign({
      sub: user.id,
      email: user.email,
      tenant_id: user.tenant_id,
      role: user.role,
    });

    return reply.send({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenant_id: user.tenant_id,
      },
    });
  });

  app.get('/me', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as { sub: string; email: string; tenant_id: string; role: string };
    return reply.send({ user: payload });
  });
}
