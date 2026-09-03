import type { APIRoute } from 'astro';
import { PedidoGenerar, erroresLegibles } from '@/lib/schemas';
import { generarRecetas, ErrorIA } from '@/lib/ia/cliente';

export const prerender = false;

/**
 * La unica ruta que existe porque la key no puede vivir en el navegador.
 * Todo lo demas (leer recetas, mover el plan, marcar la lista) el island lo
 * hace directo contra Supabase: RLS ya lo protege y una ruta intermedia solo
 * agregaria latencia y codigo que mantener.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const cuerpo = await request.json().catch(() => null);
  const pedido = PedidoGenerar.safeParse(cuerpo);
  if (!pedido.success) {
    return responder(422, { errores: erroresLegibles(pedido.error) });
  }

  const { supabase, user } = locals;
  if (!user) return responder(401, { error: 'No autenticado' });

  // Limite simple por usuario: cada llamada cuesta plata.
  const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('recetas')
    .select('id', { count: 'exact', head: true })
    .eq('origen', 'ia')
    .gte('created_at', desde);

  if ((count ?? 0) >= 40) {
    return responder(429, {
      error: 'Ya generaste muchas recetas esta hora. Prueba en un rato.',
    });
  }

  // El catalogo real es lo que restringe al modelo: si no puede nombrar un
  // ingrediente que no existe, no puede romper la lista de compras.
  const [{ data: catalogo }, { data: unidades }, { data: despensa }] = await Promise.all([
    supabase
      .from('ingredientes')
      .select('slug, nombre, base, es_basico')
      .order('nombre')
      .limit(600),
    supabase.from('unidades').select('code').order('code'),
    supabase
      .from('despensa')
      .select('cantidad, unidad_code, ingredientes(nombre)')
      .limit(60),
  ]);

  if (!catalogo?.length || !unidades?.length) {
    return responder(503, {
      error: 'El catalogo de ingredientes esta vacio. Corre los seeds primero.',
    });
  }

  try {
    const resultado = await generarRecetas({
      pedido: pedido.data,
      catalogo,
      unidades: unidades.map((u) => u.code),
      despensa: (despensa ?? []).map((d) => ({
        nombre:
          (d as { ingredientes?: { nombre?: string } | null }).ingredientes?.nombre ?? 'ingrediente',
        cantidad: d.cantidad as number,
        unidad: d.unidad_code as string,
      })),
    });

    // Los slugs validos son los del catalogo. Si el modelo invento uno, se
    // reporta en vez de guardarse: nada entra a la BD sin ingrediente real.
    const validos = new Set(catalogo.map((c) => c.slug));
    const unidadesValidas = new Set(unidades.map((u) => u.code));
    const desconocidos = new Set<string>();

    for (const receta of resultado.recetas) {
      for (const ing of receta.ingredientes) {
        if (!validos.has(ing.slug)) desconocidos.add(ing.slug);
        if (!unidadesValidas.has(ing.unidad)) desconocidos.add(`unidad:${ing.unidad}`);
      }
    }

    return responder(200, {
      criterio: resultado.criterio,
      recetas: resultado.recetas,
      // La UI muestra esto como advertencia y deja que corrijas a mano.
      desconocidos: [...desconocidos],
    });
  } catch (error) {
    if (error instanceof ErrorIA) {
      console.error('[ia]', error.message, error.detalle);
      return responder(502, { error: error.message });
    }
    throw error;
  }
};

function responder(status: number, cuerpo: unknown) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
