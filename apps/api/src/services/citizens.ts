import { supabase } from './supabase.js';

export interface Citizen {
  id: string;
  tenant_id: string;
  phone_number: string;
  full_name: string;
  dni: string;
  created_at: string;
}

/** Resultado de validar lo que el vecino dijo. El mensaje de error lo lee la IA. */
type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

export async function getCitizen(tenantId: string, phoneNumber: string): Promise<Citizen | null> {
  const { data } = await supabase
    .from('citizens')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('phone_number', phoneNumber)
    .maybeSingle();
  return (data as Citizen | null) ?? null;
}

/**
 * Acepta "30.123.456", "30 123 456" o "30123456". Rechaza lo que no tiene
 * forma de DNI y los relleno obvios (11111111), que es lo primero que alguien
 * escribe para saltearse el paso.
 */
export function normalizeDni(raw: string): Validation<string> {
  const dni = raw.replace(/[\s.\-]/g, '');
  if (!/^\d{7,8}$/.test(dni)) {
    return { ok: false, error: 'El DNI debe tener 7 u 8 números. Pedile que lo revise.' };
  }
  if (/^(\d)\1+$/.test(dni)) {
    return { ok: false, error: 'Ese DNI no parece real. Pedile su DNI verdadero.' };
  }
  return { ok: true, value: dni };
}

/** Nombre y apellido: al menos dos palabras, solo letras. */
export function normalizeFullName(raw: string): Validation<string> {
  const name = raw.trim().replace(/\s+/g, ' ');
  const words = name.split(' ');
  if (words.length < 2 || words.some((w) => !/^[\p{L}'´-]{2,}$/u.test(w))) {
    return { ok: false, error: 'Falta el nombre y apellido completo. Pedíselo de nuevo.' };
  }
  return { ok: true, value: tidyCase(words) };
}

const PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'y']);

/**
 * Se respeta cómo lo escribió el vecino ("María José de la Fuente", "O'Brien").
 * Solo se corrige si vino todo en minúsculas o todo en mayúsculas.
 */
function tidyCase(words: string[]): string {
  const joined = words.join(' ');
  const uniform =
    joined === joined.toLocaleLowerCase('es') || joined === joined.toLocaleUpperCase('es');
  if (!uniform) return joined;

  return words
    .map((w, i) => {
      const lower = w.toLocaleLowerCase('es');
      if (i > 0 && PARTICLES.has(lower)) return lower;
      return lower.charAt(0).toLocaleUpperCase('es') + lower.slice(1);
    })
    .join(' ');
}

export async function registerCitizen(
  tenantId: string,
  phoneNumber: string,
  fullName: string,
  dni: string,
): Promise<Citizen> {
  const { data, error } = await supabase
    .from('citizens')
    .upsert(
      {
        tenant_id: tenantId,
        phone_number: phoneNumber,
        full_name: fullName,
        dni,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,phone_number' },
    )
    .select('*')
    .single();

  if (error || !data) throw new Error(`No se pudo registrar al vecino: ${error?.message}`);
  return data as Citizen;
}

/**
 * Otros números registrados con el mismo DNI. No se bloquea (familias que
 * comparten teléfono, gente que cambió de número), pero el panel lo muestra.
 */
export async function otherPhonesWithDni(
  tenantId: string,
  dni: string,
  phoneNumber: string,
): Promise<string[]> {
  const { data } = await supabase
    .from('citizens')
    .select('phone_number')
    .eq('tenant_id', tenantId)
    .eq('dni', dni)
    .neq('phone_number', phoneNumber);
  return (data ?? []).map((c) => c.phone_number as string);
}
