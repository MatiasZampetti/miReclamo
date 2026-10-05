import type { ToolSpec } from './llm.js';

/**
 * Definiciones cortas a propósito: las reglas de cuándo usar cada herramienta
 * están una sola vez, en el system prompt. Repetirlas acá costaba ~900 tokens
 * por llamada, y el plan gratuito de Groq tiene un tope de tokens por minuto.
 */
export const complaintTools: ToolSpec[] = [
  {
    name: 'register_citizen',
    description: 'Registra nombre y DNI del vecino. Si devuelve error, pedile que corrija el dato.',
    input_schema: {
      type: 'object',
      properties: {
        full_name: { type: 'string', description: 'Nombre y apellido tal como los escribió' },
        dni: { type: 'string', description: 'DNI tal como lo escribió. Si ya está registrado y solo corrige el nombre, omitilo' },
      },
      required: ['full_name'],
    },
  },
  {
    name: 'save_complaint',
    description: 'Guarda el reclamo. Si devuelve error, resolvé con el vecino lo que indica.',
    input_schema: {
      type: 'object',
      properties: {
        category_id: { type: 'string', description: 'id de CATEGORÍAS DISPONIBLES' },
        subcategory_id: { type: 'string', description: 'id de subcategoría, si aplica' },
        description: { type: 'string', description: 'El problema, con las palabras del vecino' },
        location: { type: 'string', description: 'Dirección, esquina o lugar conocido' },
        summary: { type: 'string', description: 'Resumen en una oración' },
        no_photo_reason: { type: 'string', description: 'Solo si no hay foto: por qué' },
        confidence: { type: 'number', description: 'Confianza en la categoría, 0 a 1' },
        urgency: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description:
            'Riesgo para las personas. high: peligro inmediato (cables sueltos, poste caído, ' +
            'semáforo roto, pérdida de gas). medium: afecta circulación o salubridad (bache, ' +
            'basura, luminaria apagada). low: mantenimiento o estético (poda, pintura, pasto).',
        },
      },
      required: ['category_id', 'description', 'summary', 'confidence', 'urgency'],
    },
  },
  {
    name: 'check_complaint_status',
    description: 'Consulta el estado de los reclamos de este vecino.',
    input_schema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Número de reclamo (ej. 5D26D661). Omitilo para ver los últimos.' },
      },
      required: [],
    },
  },
  {
    name: 'out_of_scope',
    description: 'El mensaje no es un reclamo que la municipalidad pueda resolver (ver regla 5).',
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['not_municipal', 'off_topic'] },
        suggested_authority: {
          type: 'string',
          description: 'Solo not_municipal: organismo que corresponde (ej. "la policía")',
        },
        reason: { type: 'string', description: 'Por qué, en una oración (registro interno)' },
      },
      required: ['kind', 'reason'],
    },
  },
];
