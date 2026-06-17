import type Anthropic from '@anthropic-ai/sdk';

export const complaintTools: Anthropic.Tool[] = [
  {
    name: 'save_complaint',
    description:
      'Llamá esta herramienta cuando tengas toda la información necesaria para registrar el reclamo: categoría, descripción y ubicación.',
    input_schema: {
      type: 'object',
      properties: {
        category_id: {
          type: 'string',
          description: 'UUID de la categoría que corresponde al reclamo',
        },
        subcategory_id: {
          type: 'string',
          description: 'UUID de la subcategoría si aplica, de lo contrario null',
        },
        description: {
          type: 'string',
          description: 'Descripción completa del reclamo tal como lo expresó el ciudadano',
        },
        location: {
          type: 'string',
          description: 'Dirección o intersección donde ocurre el problema, extraída de la conversación',
        },
        summary: {
          type: 'string',
          description: 'Resumen del reclamo en una sola oración clara',
        },
        complainant_name: {
          type: 'string',
          description: 'Nombre del ciudadano si lo mencionó voluntariamente, de lo contrario null',
        },
        confidence: {
          type: 'number',
          description: 'Tu nivel de confianza en la clasificación, entre 0.0 y 1.0',
        },
      },
      required: ['category_id', 'description', 'summary', 'confidence'],
    },
  },
];
