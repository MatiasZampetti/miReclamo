import { supabase } from './supabase.js';
import type { ConversationMode, ConversationModeRow } from '../types/index.js';

/**
 * WhatsApp solo permite enviar mensajes de texto libre dentro de las 24 h
 * posteriores al último mensaje del usuario. Fuera de esa ventana Twilio
 * rechaza el envío (error 63016) y hace falta una plantilla aprobada.
 */
export const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

export function windowExpiresAt(lastInboundAt: string | null): string | null {
  if (!lastInboundAt) return null;
  return new Date(new Date(lastInboundAt).getTime() + WHATSAPP_WINDOW_MS).toISOString();
}

export function isWindowOpen(lastInboundAt: string | null): boolean {
  if (!lastInboundAt) return false;
  return Date.now() - new Date(lastInboundAt).getTime() < WHATSAPP_WINDOW_MS;
}

/**
 * Si falta conversation_modes es porque no se aplicó la migración 003.
 * PostgREST lo reporta como PGRST205 ("no está en el schema cache"); 42P01
 * (undefined_table) es el código de Postgres, que aparece si el error viene
 * de la base en lugar del cache de PostgREST. Cubrimos los dos.
 */
export class MigrationRequiredError extends Error {
  statusCode = 503;
  code = 'MIGRATION_REQUIRED';
  constructor() {
    super(
      'Falta la tabla conversation_modes. Aplicá supabase/migrations/003_human_takeover.sql ' +
        'en el SQL Editor de Supabase.',
    );
  }
}

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205']);

function throwIfMissingTable(error: { code?: string } | null): void {
  if (error?.code && MISSING_TABLE_CODES.has(error.code)) throw new MigrationRequiredError();
}

/** Devuelve el modo actual del teléfono. Si nunca se tocó, es 'agent'. */
export async function getConversationMode(
  tenantId: string,
  phoneNumber: string,
): Promise<ConversationModeRow | null> {
  const { data, error } = await supabase
    .from('conversation_modes')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('phone_number', phoneNumber)
    .maybeSingle();

  throwIfMissingTable(error);
  return (data as ConversationModeRow) ?? null;
}

/**
 * Registra que llegó un mensaje del vecino: reinicia la ventana de 24 h.
 * Se llama en cada entrante, esté en modo agente o humano.
 */
export async function recordInbound(tenantId: string, phoneNumber: string): Promise<void> {
  const { error } = await supabase
    .from('conversation_modes')
    .upsert(
      {
        tenant_id: tenantId,
        phone_number: phoneNumber,
        last_inbound_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,phone_number', ignoreDuplicates: false },
    );

  throwIfMissingTable(error);
}

/** Pasa la conversación a modo humano o la devuelve al agente. */
export async function setConversationMode(
  tenantId: string,
  phoneNumber: string,
  mode: ConversationMode,
  opts: { sessionId?: string | null; complaintId?: string | null; adminId?: string | null } = {},
): Promise<ConversationModeRow> {
  const now = new Date().toISOString();

  const payload: Record<string, unknown> = {
    tenant_id: tenantId,
    phone_number: phoneNumber,
    mode,
  };

  if (mode === 'human') {
    payload.session_id = opts.sessionId ?? null;
    payload.complaint_id = opts.complaintId ?? null;
    payload.taken_over_by = opts.adminId ?? null;
    payload.taken_over_at = now;
    payload.released_at = null;
  } else {
    payload.released_at = now;
  }

  const { data, error } = await supabase
    .from('conversation_modes')
    .upsert(payload, { onConflict: 'tenant_id,phone_number', ignoreDuplicates: false })
    .select()
    .single();

  throwIfMissingTable(error);
  if (error || !data) throw new Error(`No se pudo cambiar el modo: ${error?.message}`);
  return data as ConversationModeRow;
}
