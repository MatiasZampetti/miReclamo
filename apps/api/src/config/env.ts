import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('3001'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_KEY: z.string().min(10),
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-'),
  TWILIO_ACCOUNT_SID: z.string().startsWith('AC'),
  TWILIO_AUTH_TOKEN: z.string().min(10),
  TWILIO_WHATSAPP_NUMBER: z.string().startsWith('+'),
  JWT_SECRET: z.string().min(32),
  DEFAULT_TENANT_ID: z.string().uuid(),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('Variables de entorno inválidas:');
  console.error(result.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = result.data;
