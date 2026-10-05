import { supabase } from './supabase.js';
import type { Session, SessionContext, MessageRole } from '../types/index.js';

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

  // Una conversación que el vecino dejó colgada queda 'active' pero vencida:
  // no se reutiliza (no pasa el filtro de expires_at) y a la vez bloquea crear
  // otra, porque el índice idx_sessions_active admite una sola activa por
  // número. Se la cierra como abandonada antes de abrir la nueva.
  await supabase
    .from('sessions')
    .update({ status: 'abandoned' })
    .eq('tenant_id', tenantId)
    .eq('phone_number', phoneNumber)
    .eq('status', 'active')
    .lte('expires_at', new Date().toISOString());

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
  role: MessageRole,
  content: string,
  sentBy?: string | null,
): Promise<void> {
  await supabase.from('messages').insert({
    session_id: sessionId,
    tenant_id: tenantId,
    role,
    content,
    sent_by: sentBy ?? null,
  });
}
