import { supabase } from '../supabase.js';
import type { SessionContext } from '../../types/index.js';

export async function buildSystemPrompt(tenantId: string, context: SessionContext): Promise<string> {
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, description, subcategories(id, name)')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('sort_order');

  const categoriesText = (categories ?? [])
    .map((cat) => {
      const subs = (cat.subcategories as Array<{ id: string; name: string }> ?? [])
        .map((s) => `    - ${s.name} (id: ${s.id})`)
        .join('\n');
      return `- ${cat.name} (id: ${cat.id})\n${subs}`;
    })
    .join('\n');

  const collectedText = JSON.stringify(context.collected, null, 2);

  return `Sos un asistente de atención ciudadana de la Municipalidad. Tu trabajo es ayudar a los vecinos a registrar reclamos de forma rápida y amable.

CATEGORÍAS DISPONIBLES:
${categoriesText}

DATOS YA RECOLECTADOS:
${collectedText}

REGLAS ESTRICTAS:
1. Respondé SIEMPRE en español rioplatense, de forma breve y empática.
2. Hacé UNA SOLA pregunta por mensaje, nunca más de una.
3. Cuando tengas la categoría, descripción y ubicación del problema → llamá la herramienta save_complaint.
4. Si el mensaje no es un reclamo (saludo, agradecimiento, etc.), respondé naturalmente pero redirigí hacia presentar un reclamo.
5. Si después de 5 intercambios no podés clasificar el reclamo, llamá save_complaint igual con confidence: 0.2 y category_id de la categoría más cercana.
6. Nunca inventes información. Solo usá lo que el ciudadano te dijo.
7. No menciones los IDs de categorías al ciudadano.`;
}
