import { GoogleGenAI, Type as TipoGemini, type Schema } from '@google/genai';
import { z } from 'zod';
import { GEMINI_API_KEY, IA_MODELO } from 'astro:env/server';
import { RecetaIA, IngredienteIA, SemanaIA } from '@/lib/schemas';
import { SISTEMA, bloqueCatalogo, bloqueUsuario, bloqueIngredientes } from '@/lib/ia/prompts';
import type { ItemCatalogo, ItemDespensa } from '@/lib/ia/prompts';
import type { PedidoGenerar } from '@/lib/schemas';

/**
 * Toda la "capa de IA" es esto: dos POST con un JSON Schema cada uno y una
 * validacion. No hay vector store, ni embeddings, ni framework de agentes.
 */

export class ErrorIA extends Error {
  constructor(message: string, readonly detalle?: unknown) {
    super(message);
    this.name = 'ErrorIA';
  }
}

/**
 * Las recetas se piden en DOS llamadas, no una. El responseSchema de Gemini
 * rechaza (400 INVALID_ARGUMENT, sin mas detalle en el mensaje) un schema
 * que combina "recetas" con sus 8 campos y un array de "ingredientes"
 * anidado dentro de cada una: la complejidad total del arbol supera algun
 * limite no documentado de la API (confirmado a mano: cada mitad por
 * separado funciona sin problema; juntas, truenan). Partido en dos, cada
 * schema es simple:
 *   1. Se piden las recetas (sin ingredientes) con un "indice" por receta.
 *   2. Se piden los ingredientes en una lista PLANA con "receta_idx"
 *      apuntando a ese indice, y se reagrupan aca antes de validar con el
 *      SemanaIA original (el mismo que ya se usaba con un solo proveedor).
 */
const RecetaSinIngredientes = RecetaIA.omit({ ingredientes: true }).extend({
  indice: z.number().int().min(0).describe('Indice 0-based de esta receta, para vincular sus ingredientes despues.'),
});
const RespuestaRecetas = z.object({
  criterio: z.string().max(300).describe('En una o dos frases, por que estas recetas van bien juntas.'),
  recetas: z.array(RecetaSinIngredientes).min(1).max(7),
});

const IngredientePlano = IngredienteIA.extend({
  receta_idx: z.number().int().min(0).describe('El "indice" de la receta a la que pertenece este ingrediente.'),
});
const RespuestaIngredientes = z.object({
  ingredientes: z.array(IngredientePlano).min(2).max(140),
});

type NodoJsonSchema = {
  type?: string;
  properties?: Record<string, NodoJsonSchema>;
  items?: NodoJsonSchema;
  required?: string[];
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
};

const TIPOS_JSON_SCHEMA: Record<string, TipoGemini> = {
  object: TipoGemini.OBJECT,
  array: TipoGemini.ARRAY,
  string: TipoGemini.STRING,
  integer: TipoGemini.INTEGER,
  number: TipoGemini.NUMBER,
  boolean: TipoGemini.BOOLEAN,
};

/**
 * El schema de Gemini es un subconjunto de OpenAPI 3.0 con particularidades
 * propias: `type` es un enum (no el string de JSON Schema), `minItems` y
 * `maxLength` son string (no number) y no existe `exclusiveMinimum`. Se
 * traduce aca en vez de a mano en dos lugares. Recortar de mas no rompe nada:
 * `safeParse()` mas abajo vuelve a aplicar los limites finos, igual que ya
 * hacia falta para atrapar un modelo que se sale del molde.
 *
 * Un caso se recorta a proposito y no por prolijidad: `minItems`/`maxItems`
 * en un array cuyos `items` son un OBJECT con varias properties hace que la
 * API responda 400 "Request contains an invalid argument" sin mas detalle
 * (confirmado a mano contra la API real). El mismo array sin esos dos campos,
 * o un array de items simples (STRING) con los mismos limites, funciona sin
 * problema. Es un limite no documentado del lado de Gemini, no un error de
 * esta traduccion; `.min()`/`.max()` en el array de Zod los sigue aplicando
 * `safeParse()` de todas formas.
 */
function esquemaGemini(nodo: NodoJsonSchema): Schema {
  const salida: Schema = { type: TIPOS_JSON_SCHEMA[nodo.type ?? 'object'] };
  const esArrayDeObjetos = nodo.type === 'array' && nodo.items?.type === 'object';

  if (nodo.required) salida.required = nodo.required;
  if (!esArrayDeObjetos) {
    if (nodo.minItems !== undefined) salida.minItems = String(nodo.minItems);
    if (nodo.maxItems !== undefined) salida.maxItems = String(nodo.maxItems);
  }
  if (nodo.minLength !== undefined) salida.minLength = String(nodo.minLength);
  if (nodo.maxLength !== undefined) salida.maxLength = String(nodo.maxLength);
  if (nodo.maximum !== undefined) salida.maximum = nodo.maximum;
  if (nodo.minimum !== undefined) salida.minimum = nodo.minimum;
  else if (nodo.exclusiveMinimum !== undefined) salida.minimum = nodo.exclusiveMinimum;

  if (nodo.properties) {
    salida.properties = Object.fromEntries(
      Object.entries(nodo.properties).map(([clave, valor]) => [clave, esquemaGemini(valor)]),
    );
  }
  if (nodo.items) salida.items = esquemaGemini(nodo.items);

  return salida;
}

function esquemaDe(schema: z.ZodType): Schema {
  const json = z.toJSONSchema(schema, { target: 'draft-7', io: 'input' }) as NodoJsonSchema;
  return esquemaGemini(json);
}

async function llamarGemini<T extends z.ZodType>(opts: {
  systemInstruction: string;
  contenido: string;
  schema: T;
  maxOutputTokens: number;
}): Promise<z.infer<T>> {
  if (!GEMINI_API_KEY) {
    throw new ErrorIA('Falta GEMINI_API_KEY en el entorno.');
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  let texto: string | undefined;
  try {
    const respuesta = await ai.models.generateContent({
      model: IA_MODELO,
      contents: opts.contenido,
      config: {
        systemInstruction: opts.systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: esquemaDe(opts.schema),
        maxOutputTokens: opts.maxOutputTokens,
      },
    });
    texto = respuesta.text;
  } catch (error) {
    throw new ErrorIA('El modelo no respondio.', error);
  }

  if (!texto) {
    throw new ErrorIA('El modelo respondio vacio.');
  }

  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch (error) {
    throw new ErrorIA('El modelo devolvio algo que no es JSON valido.', error);
  }

  // Si el modelo se salio del molde, revienta aca y no en la base de datos.
  const parseado = opts.schema.safeParse(bruto);
  if (!parseado.success) {
    throw new ErrorIA('El modelo devolvio una respuesta con forma invalida.', parseado.error.issues);
  }

  return parseado.data;
}

export async function generarRecetas(opts: {
  pedido: z.infer<typeof PedidoGenerar>;
  catalogo: ItemCatalogo[];
  unidades: string[];
  despensa: ItemDespensa[];
}): Promise<SemanaIA> {
  const catalogoTexto = bloqueCatalogo(opts.catalogo, opts.unidades);

  const pasoRecetas = await llamarGemini({
    systemInstruction: [
      SISTEMA,
      catalogoTexto,
      'En este paso SOLO defines las recetas (titulo, resumen, tiempos, etiquetas, pasos) ' +
        'y un "indice" 0-based por receta. NO generes ingredientes todavia, eso se pide despues.',
    ].join('\n\n'),
    contenido: bloqueUsuario(opts.pedido, opts.despensa),
    schema: RespuestaRecetas,
    maxOutputTokens: 4096,
  });

  const pasoIngredientes = await llamarGemini({
    systemInstruction: [
      SISTEMA,
      catalogoTexto,
      'Ya se definieron las recetas. En este paso SOLO das su lista de ingredientes: una ' +
        'lista PLANA de ingredientes, cada uno con "receta_idx" apuntando al "indice" de la ' +
        'receta a la que pertenece.',
    ].join('\n\n'),
    contenido: bloqueIngredientes(pasoRecetas.recetas, opts.pedido, opts.despensa),
    schema: RespuestaIngredientes,
    maxOutputTokens: 4096,
  });

  const recetas: RecetaIA[] = pasoRecetas.recetas.map((receta) => ({
    titulo: receta.titulo,
    resumen: receta.resumen,
    porciones: receta.porciones,
    min_prep: receta.min_prep,
    min_coccion: receta.min_coccion,
    etiquetas: receta.etiquetas,
    pasos: receta.pasos,
    ingredientes: pasoIngredientes.ingredientes
      .filter((ing) => ing.receta_idx === receta.indice)
      .map((ing) => ({ slug: ing.slug, cantidad: ing.cantidad, unidad: ing.unidad, nota: ing.nota })),
  }));

  const parseado = SemanaIA.safeParse({ criterio: pasoRecetas.criterio, recetas });
  if (!parseado.success) {
    // Lo mas comun aca: una receta se quedo con menos de 2 ingredientes
    // porque el modelo no le asigno bien el receta_idx.
    throw new ErrorIA('El modelo devolvio una receta con forma invalida.', parseado.error.issues);
  }

  return parseado.data;
}
