import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('3001'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_KEY: z.string().min(10),
  // Qué modelo atiende el chat: Groq (gratis) o Claude (pago, mejor calidad)
  LLM_PROVIDER: z.enum(['groq', 'anthropic']).default('groq'),
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-').optional(),
  GROQ_MODEL: z.string().default('openai/gpt-oss-120b'),
  TWILIO_ACCOUNT_SID: z.string().startsWith('AC'),
  TWILIO_AUTH_TOKEN: z.string().min(10),
  TWILIO_WHATSAPP_NUMBER: z.string().startsWith('+'),
  JWT_SECRET: z.string().min(32),
  DEFAULT_TENANT_ID: z.string().uuid(),
  // Origen permitido por CORS: de dónde se sirve el dashboard.
  WEB_URL: z.string().url().default('http://localhost:3000'),
  // Chat (si LLM_PROVIDER=groq) y transcripción de audios
  GROQ_API_KEY: z.string().startsWith('gsk_').optional(),
});

const result = envSchema
  .superRefine((e, ctx) => {
    // La clave del proveedor elegido es obligatoria; la del otro, no
    if (e.LLM_PROVIDER === 'groq' && !e.GROQ_API_KEY) {
      ctx.addIssue({ code: 'custom', path: ['GROQ_API_KEY'], message: 'Requerida con LLM_PROVIDER=groq' });
    }
    if (e.LLM_PROVIDER === 'anthropic' && !e.ANTHROPIC_API_KEY) {
      ctx.addIssue({ code: 'custom', path: ['ANTHROPIC_API_KEY'], message: 'Requerida con LLM_PROVIDER=anthropic' });
    }
  })
  .safeParse(process.env);

if (!result.success) {
  console.error('Variables de entorno inválidas:');
  console.error(result.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = result.data;
