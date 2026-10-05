import { supabase } from './supabase.js';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente (todavía no lo tomó ningún área)',
  in_progress: 'En proceso',
  resolved: 'Resuelto',
  rejected: 'Rechazado',
};

/** El número que ve el vecino son los primeros 8 caracteres del id, en mayúsculas. */
export function complaintCode(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

/**
 * Estado de los reclamos de un vecino, como texto para el modelo.
 *
 * Solo busca entre los reclamos de ESE teléfono: el número de reclamo es
 * corto y adivinable, así que no puede servir para ver reclamos ajenos (con
 * nombre y dirección de otra persona).
 */
export async function describeComplaintStatus(
  tenantId: string,
  phoneNumber: string,
  rawCode?: string,
): Promise<{ found: boolean; text: string }> {
  const { data } = await supabase
    .from('complaints')
    .select('id, summary, location, status, status_note, created_at, updated_at, resolved_at')
    .eq('tenant_id', tenantId)
    .eq('phone_number', phoneNumber)
    .order('created_at', { ascending: false })
    .limit(20);

  const complaints = data ?? [];
  if (complaints.length === 0) {
    return { found: false, text: 'Este vecino no tiene reclamos registrados desde este número.' };
  }

  const code = rawCode?.replace(/[^0-9a-z]/gi, '').toUpperCase();
  if (code) {
    const match = complaints.find((c) => complaintCode(c.id).startsWith(code) && code.length >= 4);
    if (!match) {
      const own = complaints.slice(0, 5).map((c) => complaintCode(c.id)).join(', ');
      return {
        found: false,
        text: `No hay un reclamo ${code} a nombre de este número. Sus reclamos son: ${own}.`,
      };
    }
    return { found: true, text: formatComplaint(match) };
  }

  return { found: true, text: complaints.slice(0, 3).map(formatComplaint).join('\n\n') };
}

function formatComplaint(c: {
  id: string;
  summary: string;
  location: string | null;
  status: string;
  status_note: string | null;
  created_at: string;
  updated_at: string | null;
  resolved_at: string | null;
}): string {
  const lines = [
    `Reclamo ${complaintCode(c.id)}: ${c.summary}`,
    `Ubicación: ${c.location ?? 'sin dato'}`,
    `Estado: ${STATUS_LABELS[c.status] ?? c.status}`,
    `Registrado: ${formatDate(c.created_at)}`,
  ];
  if (c.status_note) lines.push(`Nota del municipio: ${c.status_note}`);
  if (c.resolved_at) lines.push(`Resuelto el: ${formatDate(c.resolved_at)}`);
  else if (c.updated_at && c.updated_at !== c.created_at) lines.push(`Última actualización: ${formatDate(c.updated_at)}`);
  return lines.join('\n');
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Cordoba',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}
