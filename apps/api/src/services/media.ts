import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { supabase } from './supabase.js';
import type { InboundMessage } from '../types/index.js';

/** Bucket privado: las fotos solo se ven con URLs firmadas desde el panel. */
export const PHOTO_BUCKET = 'complaint-photos';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

export function isSupportedImage(contentType: string): boolean {
  return contentType in EXTENSIONS;
}

/**
 * Baja un adjunto (foto, audio) de Twilio.
 *
 * Las URLs de media de Twilio piden autenticación básica con las credenciales
 * de la cuenta y redirigen a un enlace firmado; fetch suelta el header
 * Authorization al cambiar de dominio, que es justo lo que corresponde.
 */
export async function downloadTwilioMedia(mediaUrl: string): Promise<Buffer> {
  const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const res = await fetch(mediaUrl, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) throw new Error(`Twilio devolvió ${res.status} al bajar el adjunto`);
  return Buffer.from(await res.arrayBuffer());
}

/** Baja la foto de Twilio y la sube a Storage. Devuelve la ruta dentro del bucket. */
export async function storeTwilioPhoto(
  tenantId: string,
  phoneNumber: string,
  mediaUrl: string,
  contentType: string,
): Promise<string> {
  const body = await downloadTwilioMedia(mediaUrl);
  const path = `${tenantId}/${phoneNumber.replace(/\D/g, '')}/${randomUUID()}.${EXTENSIONS[contentType]}`;

  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, body, { contentType, upsert: false });
  if (error) throw new Error(`No se pudo guardar la foto: ${error.message}`);

  return path;
}

/** URLs temporales para que el panel muestre las fotos de un bucket privado. */
export async function signedPhotoUrls(paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 60 * 60);
  return (data ?? []).map((d) => d.signedUrl).filter((u): u is string => Boolean(u));
}

/** Suma fotos a un reclamo ya creado (llegan en modo humano, con el admin atendiendo). */
export async function appendComplaintPhotos(
  complaintId: string,
  tenantId: string,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  const { data } = await supabase
    .from('complaints')
    .select('photos')
    .eq('id', complaintId)
    .eq('tenant_id', tenantId)
    .single();
  if (!data) return;

  await supabase
    .from('complaints')
    .update({ photos: [...((data.photos as string[] | null) ?? []), ...paths] })
    .eq('id', complaintId)
    .eq('tenant_id', tenantId);
}

/** Cómo queda el mensaje en el historial (lo leen la IA y el panel). */
export function describeInbound(inbound: InboundMessage): string {
  const parts: string[] = [];
  if (inbound.photos.length > 0) {
    parts.push(inbound.photos.length === 1 ? '[📷 Foto]' : `[📷 ${inbound.photos.length} fotos]`);
  }
  if (inbound.failedPhotos > 0) {
    parts.push('[Mandó una foto que no se pudo guardar]');
  }
  if (inbound.transcript) {
    parts.push(`[🎤 Audio]: ${inbound.transcript}`);
  }
  if (inbound.failedAudios > 0) {
    parts.push('[Mandó un audio que no se pudo transcribir]');
  }
  for (const type of inbound.unsupportedMedia) {
    parts.push(`[Adjunto no soportado: ${type}]`);
  }
  if (inbound.location) {
    const { latitude, longitude, label } = inbound.location;
    parts.push(
      `[📍 Ubicación compartida: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}${label ? ` — ${label}` : ''}]`,
    );
  }
  if (inbound.text) parts.push(inbound.text);
  return parts.join(' ');
}
