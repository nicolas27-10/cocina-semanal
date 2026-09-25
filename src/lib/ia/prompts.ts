import type { PedidoGenerar } from '@/lib/schemas';
import type { z } from 'zod';

export type ItemCatalogo = { slug: string; nombre: string; base: string; es_basico: boolean };
export type ItemDespensa = { nombre: string; cantidad: number; unidad: string };

/**
 * El system prompt es estable entre llamadas, asi que se puede cachear.
 * Lo variable (el pedido) va en el mensaje del usuario.
 */
export const SISTEMA = `Eres un cocinero que planifica el menu de una casa en Chile.

Reglas que no se negocian:
- Usa SOLO los slugs de ingredientes del catalogo entregado. Si un plato necesita
  algo que no esta en el catalogo, cambia el plato, no inventes el slug.
- Usa SOLO los codigos de unidad entregados.
- Las cantidades son para el total de porciones de la receta, no por persona.
- Cantidades realistas para una cocina de casa: si el numero se ve raro escrito
  en una lista de compras, esta mal.
- Ingredientes que se compran en supermercado chileno. Nada exotico ni de tienda
  especializada.
- Escribe en espanol de Chile, sin voseo, directo. Los pasos en imperativo.
- No inventes marcas ni precios.`;

/** El catalogo es lo que restringe al modelo. Compacto para no gastar tokens. */
export function bloqueCatalogo(catalogo: ItemCatalogo[], unidades: string[]): string {
  const lista = catalogo
    .map((i) => `${i.slug}=${i.nombre}${i.es_basico ? '*' : ''}`)
    .join('; ');

  return [
    `CATALOGO DE INGREDIENTES (slug=nombre, * = basico que casi siempre hay en casa):`,
    lista,
    ``,
    `CODIGOS DE UNIDAD VALIDOS: ${unidades.join(', ')}`,
  ].join('\n');
}

export function bloqueUsuario(
  pedido: z.infer<typeof PedidoGenerar>,
  despensa: ItemDespensa[],
): string {
  const partes: string[] = [
    `Pedido: ${pedido.pedido}`,
    `Porciones por plato: ${pedido.porciones}`,
    `Cantidad de recetas: ${pedido.cantidad}`,
  ];

  if (pedido.usar_despensa && despensa.length > 0) {
    partes.push(
      `Ya hay en casa (usalo antes de que se pierda): ` +
        despensa.map((d) => `${d.nombre} ${d.cantidad} ${d.unidad}`).join(', '),
    );
  }

  if (pedido.reusar_ingredientes && pedido.cantidad > 1) {
    // Esta es la instruccion que hace que la lista de compras sea corta
    // y que no sobre media bolsa de cilantro. Es el valor real de la IA aca,
    // mas que inventar recetas.
    partes.push(
      `Optimiza el conjunto, no cada plato por separado: los ${pedido.cantidad} platos ` +
        `deben compartir la mayor cantidad de ingredientes posible, de modo que la compra ` +
        `sea corta y no sobren perecibles a medio usar. No repitas la misma proteina ` +
        `principal en dos platos seguidos. Al menos un tercio de los platos debe tomar ` +
        `menos de 30 minutos en total.`,
    );
  }

  return partes.join('\n');
}

/**
 * Segundo paso: dadas las recetas ya definidas (sin ingredientes todavia),
 * pide los ingredientes de cada una. Existe como llamada separada porque el
 * responseSchema de Gemini rechaza (400 INVALID_ARGUMENT, sin mas detalle)
 * un schema que combina "recetas" y "ingredientes anidados" en un mismo
 * arbol — la complejidad total del schema supera algun limite no
 * documentado de la API. Partido en dos, cada schema es simple y funciona.
 */
export function bloqueIngredientes(
  recetas: { indice: number; titulo: string; resumen: string; porciones: number }[],
  pedido: z.infer<typeof PedidoGenerar>,
  despensa: ItemDespensa[],
): string {
  const partes: string[] = [
    'Ya se definieron estas recetas (no cambies el titulo ni la idea, dales sus ingredientes):',
    ...recetas.map(
      (r) => `[indice ${r.indice}] ${r.titulo} (${r.porciones} porciones) — ${r.resumen}`,
    ),
  ];

  if (pedido.usar_despensa && despensa.length > 0) {
    partes.push(
      `Ya hay en casa (usalo antes de que se pierda): ` +
        despensa.map((d) => `${d.nombre} ${d.cantidad} ${d.unidad}`).join(', '),
    );
  }

  if (pedido.reusar_ingredientes && recetas.length > 1) {
    partes.push(
      `Maximiza cuantos ingredientes se repiten entre estas recetas, de modo que la ` +
        `compra sea corta y no sobren perecibles a medio usar.`,
    );
  }

  return partes.join('\n');
}
