import { z } from 'zod';

/**
 * Un solo lugar define la forma de una receta generada por IA.
 *
 * El MISMO schema se usa para dos cosas:
 *   1. `z.toJSONSchema()` produce el input_schema de la tool que el modelo
 *      esta obligado a llenar.
 *   2. `.parse()` valida lo que vuelve antes de que toque la base de datos.
 *
 * Los `.describe()` no son comentarios: viajan al JSON Schema y el modelo los
 * lee. Son prompt. Y los `.max()` no son cosmeticos: un modelo puede escribir
 * "500 kg de sal" con toda seguridad, y sin el limite eso entra a tu lista.
 */

export const IngredienteIA = z.object({
  slug: z
    .string()
    .min(2)
    .describe('Slug EXACTO del catalogo entregado. No inventes slugs nuevos.'),
  cantidad: z
    .number()
    .positive()
    .max(5000)
    .describe('Cantidad para el total de porciones de la receta, no por persona.'),
  unidad: z
    .string()
    .min(1)
    .describe('Codigo EXACTO de unidad del listado entregado (g, kg, ml, taza, un, ...).'),
  nota: z
    .string()
    .max(60)
    .optional()
    .describe('Preparacion previa, si aplica: "picado fino", "sin piel".'),
});

export const RecetaIA = z.object({
  titulo: z.string().min(3).max(70).describe('Nombre del plato, sin adjetivos de marketing.'),
  resumen: z.string().min(10).max(180).describe('Una frase de que es el plato.'),
  porciones: z.number().int().min(1).max(12),
  min_prep: z.number().int().min(0).max(240),
  min_coccion: z.number().int().min(0).max(300),
  etiquetas: z
    .array(z.string().max(20))
    .max(5)
    .describe('Ej: "rapido", "vegetariano", "olla", "horno".'),
  pasos: z
    .array(z.string().min(10).max(400))
    .min(3)
    .max(15)
    .describe('Un paso por elemento, en orden, en imperativo.'),
  ingredientes: z.array(IngredienteIA).min(2).max(20),
});

export type RecetaIA = z.infer<typeof RecetaIA>;

export const SemanaIA = z.object({
  criterio: z
    .string()
    .max(300)
    .describe('En una o dos frases, por que estas recetas van bien juntas esta semana.'),
  recetas: z.array(RecetaIA).min(1).max(7),
});

export type SemanaIA = z.infer<typeof SemanaIA>;

/* ------------------------------------------------------------------ */
/* Payloads de las rutas de API. Todo lo que entra por POST se valida. */
/* ------------------------------------------------------------------ */

export const PedidoGenerar = z.object({
  pedido: z
    .string()
    .min(3, 'Conta un poco mas de que tienes ganas.')
    .max(500, 'Demasiado largo, resumilo.'),
  porciones: z.number().int().min(1).max(12).default(4),
  /** Cuantas recetas generar de una. 1 = una receta, 7 = la semana completa. */
  cantidad: z.number().int().min(1).max(7).default(1),
  /** Si true, se le pasa la despensa y se le pide reusar lo que ya hay. */
  usar_despensa: z.boolean().default(true),
  /** Si true, se le pide maximizar ingredientes compartidos entre platos. */
  reusar_ingredientes: z.boolean().default(true),
});

export const PedidoEntrada = z.object({
  plan_id: z.uuid(),
  dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  momento: z.enum(['desayuno', 'almuerzo', 'cena', 'snack']),
  receta_id: z.uuid().nullable().optional(),
  texto_libre: z.string().max(80).nullable().optional(),
  porciones_override: z.number().int().min(1).max(20).nullable().optional(),
});

export const PedidoLista = z.object({
  plan_id: z.uuid(),
});

/** Errores de Zod -> mensajes cortos por campo, listos para mostrar. */
export function erroresLegibles(error: z.ZodError): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const issue of error.issues) {
    const clave = issue.path.join('.') || '_';
    salida[clave] ??= issue.message;
  }
  return salida;
}
