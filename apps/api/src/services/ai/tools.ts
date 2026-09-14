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
        urgency: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description:
            'Grado de urgencia según el riesgo para las personas: "high" si hay peligro inmediato ' +
            '(cables sueltos, semáforo roto, pérdida de gas, poste caído, calle intransitable), ' +
            '"medium" si afecta la circulación o la salubridad sin peligro inmediato ' +
            '(bache, contenedor desbordado, luminaria apagada), ' +
            '"low" si es mantenimiento o estético (poda, pintura, pasto alto).',
        },
      },
      required: ['category_id', 'description', 'summary', 'confidence', 'urgency'],
    },
  },
  {
    name: 'out_of_scope',
    description:
      'Llamá esta herramienta cuando el mensaje NO corresponde a un reclamo municipal que ' +
      'esta municipalidad pueda resolver. NO la uses para saludos, agradecimientos, despedidas ' +
      'ni para mensajes confusos donde todavía podés preguntar de qué se trata: en esos casos ' +
      'respondé normalmente y guiá a la persona hacia el reclamo.',
    input_schema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['not_municipal', 'off_topic'],
          description:
            '"not_municipal": es un reclamo o problema real, pero le corresponde a otro organismo ' +
            '(policía, bomberos, defensa civil, vialidad provincial o nacional, EPEC, empresa de ' +
            'agua o gas, justicia). La persona actúa de buena fe, solo se equivocó de canal. ' +
            '"off_topic": el mensaje no tiene ninguna relación con un reclamo ni con la ' +
            'municipalidad (charla, publicidad, spam, insultos, pruebas, preguntas sin sentido).',
        },
        suggested_authority: {
          type: 'string',
          description:
            'Solo para "not_municipal": a qué organismo le corresponde, en lenguaje simple ' +
            '(ej. "la policía", "la empresa de energía"). Si no lo sabés con certeza, omitilo.',
        },
        reason: {
          type: 'string',
          description: 'En una oración, por qué queda fuera del alcance. Es para el registro interno.',
        },
      },
      required: ['kind', 'reason'],
    },
  },
];
