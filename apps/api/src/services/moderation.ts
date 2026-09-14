import { supabase } from './supabase.js';
import { getConversationMode } from './conversation-mode.js';
import type { ConversationModeRow } from '../types/index.js';

/**
 * Política de mensajes fuera de tema.
 *
 * Solo suman strike los mensajes SIN relación con la municipalidad. Un reclamo
 * real dirigido a otro organismo no suma: esa persona actúa de buena fe.
 *
 * Escalada: aviso en el 1er strike, último aviso en el 2do, bloqueo en el 3ro.
 * Se eligieron 3 y no 2 porque es un canal público de atención al vecino: una
 * clasificación errónea del modelo no debería costarle el acceso a alguien que
 * después necesita reportar algo real. Para endurecerlo, bajá BLOCK_AT.
 */
export const OFFTOPIC_BLOCK_AT = 3;

export interface OffTopicOutcome {
  strikes: number;
  blocked: boolean;
  /** Mensaje a enviarle al vecino */
  message: string;
}

/** ¿El número está bloqueado? */
export function isBlocked(row: ConversationModeRow | null): boolean {
  return Boolean(row?.blocked_at);
}

/**
 * Registra un mensaje fuera de tema y devuelve qué responderle al vecino.
 * Al llegar a OFFTOPIC_BLOCK_AT el número queda bloqueado.
 */
export async function registerOffTopic(
  tenantId: string,
  phoneNumber: string,
  reason: string,
): Promise<OffTopicOutcome> {
  const current = await getConversationMode(tenantId, phoneNumber);
  const strikes = (current?.offtopic_strikes ?? 0) + 1;
  const now = new Date().toISOString();
  const blocked = strikes >= OFFTOPIC_BLOCK_AT;

  await supabase
    .from('conversation_modes')
    .upsert(
      {
        tenant_id: tenantId,
        phone_number: phoneNumber,
        offtopic_strikes: strikes,
        last_offtopic_at: now,
        warned_at: now,
        ...(blocked ? { blocked_at: now, blocked_reason: reason } : {}),
      },
      { onConflict: 'tenant_id,phone_number', ignoreDuplicates: false },
    );

  return { strikes, blocked, message: buildMessage(strikes, blocked) };
}

function buildMessage(strikes: number, blocked: boolean): string {
  if (blocked) {
    return (
      'Tu número fue bloqueado por enviar reiteradamente mensajes que no corresponden a ' +
      'reclamos municipales.\n\n' +
      'Si creés que fue un error, acercate a la Municipalidad para que lo revisen.'
    );
  }

  if (strikes === 1) {
    return (
      'Este canal es exclusivamente para registrar reclamos municipales.\n\n' +
      'Si seguís enviando mensajes que no corresponden, tu número va a ser bloqueado.\n\n' +
      '¿Querés reportar algún problema en la vía pública?'
    );
  }

  return (
    '⚠️ Último aviso: este canal es solo para reclamos municipales.\n\n' +
    'Si volvés a enviar un mensaje que no corresponde, tu número va a quedar bloqueado ' +
    'y no vas a poder usar este servicio.'
  );
}

/**
 * Mensaje para un reclamo real que le corresponde a otro organismo.
 * No suma strike: la persona tiene un problema legítimo, solo erró el canal.
 */
export function buildNotMunicipalMessage(suggestedAuthority?: string): string {
  const destino = suggestedAuthority
    ? `Por lo que contás, te conviene comunicarte con ${suggestedAuthority}.`
    : 'Te sugerimos comunicarte con el organismo que corresponda.';

  return (
    `Este canal recibe únicamente reclamos que resuelve la Municipalidad ` +
    `(alumbrado, limpieza, baches, espacios verdes, tránsito municipal).\n\n` +
    `${destino}\n\n` +
    `Si además tenés algún problema en la vía pública que dependa del municipio, ` +
    `contámelo y lo registro.`
  );
}

/** Reinicia los strikes: usado cuando la persona registra un reclamo válido. */
export async function clearStrikes(tenantId: string, phoneNumber: string): Promise<void> {
  await supabase
    .from('conversation_modes')
    .upsert(
      { tenant_id: tenantId, phone_number: phoneNumber, offtopic_strikes: 0, warned_at: null },
      { onConflict: 'tenant_id,phone_number', ignoreDuplicates: false },
    );
}

/** Desbloqueo manual desde el panel. */
export async function unblockPhone(
  tenantId: string,
  phoneNumber: string,
  adminId: string,
): Promise<void> {
  await supabase
    .from('conversation_modes')
    .update({
      blocked_at: null,
      blocked_reason: null,
      offtopic_strikes: 0,
      warned_at: null,
      unblocked_by: adminId,
    })
    .eq('tenant_id', tenantId)
    .eq('phone_number', phoneNumber);
}
