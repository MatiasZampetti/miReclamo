import { env } from '../config/env.js';

/**
 * Transcripción de audios de WhatsApp con Whisper en Groq (plan gratuito).
 * Claude no procesa audio: el vecino habla, esto lo pasa a texto y el agente
 * lo lee como si lo hubiera escrito.
 */
const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODEL = 'whisper-large-v3-turbo';

/** Formatos que acepta Whisper. WhatsApp manda las notas de voz como audio/ogg (opus). */
const EXTENSIONS: Record<string, string> = {
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'm4a',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
};

export function canTranscribe(contentType: string): boolean {
  // "audio/ogg; codecs=opus" → "audio/ogg"
  return Boolean(env.GROQ_API_KEY) && baseType(contentType) in EXTENSIONS;
}

export async function transcribeAudio(audio: Buffer, contentType: string): Promise<string> {
  if (!env.GROQ_API_KEY) throw new Error('Falta GROQ_API_KEY');

  const type = baseType(contentType);
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(audio)], { type }), `audio.${EXTENSIONS[type]}`);
  form.append('model', MODEL);
  // Fijar el idioma evita que un audio corto o con ruido se transcriba en otro
  form.append('language', 'es');
  form.append('response_format', 'json');

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Groq devolvió ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const { text } = (await res.json()) as { text?: string };
  return (text ?? '').trim();
}

function baseType(contentType: string): string {
  return contentType.split(';')[0].trim().toLowerCase();
}
