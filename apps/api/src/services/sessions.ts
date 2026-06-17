import { supabase } from './supabase.js';
import type { Session, SessionContext } from '../types/index.js';

const DEFAULT_CONTEXT: SessionContext = {
  state: 'greeting',
  collected: {},
  missing_fields: [],
  messages: [],
  attempts: 0,
};

export async function getOrCreateSession(tenantId: string, phoneNumber: string): Promise<Session> {
  const { data: existing } = await supabase
    .from('sessions')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('phone_number', phoneNumber)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .single();

  if (existing) return existing as Session;

  const { data: created, error } = await supabase
    .from('sessions')
    .insert({
      tenant_id: tenantId,
      phone_number: phoneNumber,
      status: 'active',
      context: DEFAULT_CONTEXT,
    })
    .select()
    .single();

  if (error || !created) throw new Error(`Error creando sesión: ${error?.message}`);

  return created as Session;
}

export async function updateSessionContext(sessionId: string, context: SessionContext): Promise<void> {
  await supabase
    .from('sessions')
    .update({ context })
    .eq('id', sessionId);
}

export async function completeSession(sessionId: string): Promise<void> {
  await supabase
    .from('sessions')
    .update({ status: 'completed' })
    .eq('id', sessionId);
}

export async function saveMessage(
  sessionId: string,
  tenantId: string,
  role: 'user' | 'assistant',
  content: string,
): Promise<void> {
  await supabase.from('messages').insert({ session_id: sessionId, tenant_id: tenantId, role, content });
}
