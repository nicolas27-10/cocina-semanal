import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { ANTHROPIC_API_KEY, IA_MODELO } from 'astro:env/server';
import { SemanaIA } from '@/lib/schemas';
import { SISTEMA, bloqueCatalogo, bloqueUsuario } from '@/lib/ia/prompts';
import type { ItemCatalogo, ItemDespensa } from '@/lib/ia/prompts';
import type { PedidoGenerar } from '@/lib/schemas';

/**
 * Toda la "capa de IA" es esto: un POST con un JSON Schema y una validacion.
 * No hay vector store, ni embeddings, ni framework de agentes. Si alguna vez
 * los necesitas sera para otra cosa, no para esto.
 */

export class ErrorIA extends Error {
  constructor(message: string, readonly detalle?: unknown) {
    super(message);
    this.name = 'ErrorIA';
  }
}

/** El mismo Zod que valida la respuesta genera el contrato que el modelo llena. */
function esquemaTool() {
  const json = z.toJSONSchema(SemanaIA, { target: 'draft-7', io: 'input' }) as Record<string, unknown>;
  delete json['$schema'];
  return json as Anthropic.Tool.InputSchema;
}

export async function generarRecetas(opts: {
  pedido: z.infer<typeof PedidoGenerar>;
  catalogo: ItemCatalogo[];
  unidades: string[];
  despensa: ItemDespensa[];
}): Promise<SemanaIA> {
  if (!ANTHROPIC_API_KEY) {
    throw new ErrorIA('Falta ANTHROPIC_API_KEY en el entorno.');
  }

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  let respuesta: Anthropic.Message;
  try {
    respuesta = await anthropic.messages.create({
      model: IA_MODELO,
      max_tokens: 4096,
      // El catalogo no cambia entre llamadas: se cachea y se deja de pagar.
      system: [
        { type: 'text', text: SISTEMA },
        {
          type: 'text',
          text: bloqueCatalogo(opts.catalogo, opts.unidades),
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [
        {
          name: 'entregar_recetas',
          description:
            'Entrega las recetas en formato estructurado. Es la unica forma de responder.',
          input_schema: esquemaTool(),
        },
      ],
      // Sin esto el modelo puede responder en prosa y no tienes nada que parsear.
      tool_choice: { type: 'tool', name: 'entregar_recetas' },
      messages: [{ role: 'user', content: bloqueUsuario(opts.pedido, opts.despensa) }],
    });
  } catch (error) {
    throw new ErrorIA('El modelo no respondio.', error);
  }

  const bloque = respuesta.content.find((c) => c.type === 'tool_use');
  if (!bloque || bloque.type !== 'tool_use') {
    throw new ErrorIA('El modelo respondio sin usar la tool.', respuesta.stop_reason);
  }

  // Si el modelo se salio del molde, revienta aca y no en la base de datos.
  const parseado = SemanaIA.safeParse(bloque.input);
  if (!parseado.success) {
    throw new ErrorIA('El modelo devolvio una receta con forma invalida.', parseado.error.issues);
  }

  return parseado.data;
}
