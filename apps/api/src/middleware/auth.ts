import type { FastifyRequest, FastifyReply } from 'fastify';

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    // Se devuelve el reply para cortar el ciclo de vida: sin el return, Fastify
    // depende de su guard interno para no invocar igual al handler.
    return reply.status(401).send({ error: 'No autorizado', code: 'UNAUTHORIZED' });
  }
}
