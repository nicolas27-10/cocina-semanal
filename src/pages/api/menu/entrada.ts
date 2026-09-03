import type { APIRoute } from 'astro';
import { PedidoEntrada, erroresLegibles } from '@/lib/schemas';

export const prerender = false;

/** Asigna (o reemplaza) una receta en una casilla del plan. */
export const PUT: APIRoute = async ({ request, locals }) => {
  const { supabase, user } = locals;
  if (!user) return responder(401, { error: 'No autenticado' });

  const cuerpo = await request.json().catch(() => null);
  const parseado = PedidoEntrada.safeParse(cuerpo);
  if (!parseado.success) {
    return responder(422, { errores: erroresLegibles(parseado.error) });
  }
  const p = parseado.data;

  if (!p.receta_id && !p.texto_libre) {
    return responder(422, { error: 'La casilla necesita una receta o un texto.' });
  }

  // unique(plan_id, dia, momento) convierte esto en "mover" sin borrar antes.
  const { data, error } = await supabase
    .from('plan_entradas')
    .upsert(
      {
        plan_id: p.plan_id,
        dia: p.dia,
        momento: p.momento,
        receta_id: p.receta_id ?? null,
        texto_libre: p.texto_libre ?? null,
        porciones_override: p.porciones_override ?? null,
      },
      { onConflict: 'plan_id,dia,momento' },
    )
    .select('id')
    .single();

  if (error) return responder(500, { error: error.message });
  return responder(200, { id: data.id });
};

/** Vacia una casilla. */
export const DELETE: APIRoute = async ({ request, locals }) => {
  const { supabase, user } = locals;
  if (!user) return responder(401, { error: 'No autenticado' });

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return responder(422, { error: 'Falta el id de la entrada.' });

  const { error } = await supabase.from('plan_entradas').delete().eq('id', id);
  if (error) return responder(500, { error: error.message });
  return new Response(null, { status: 204 });
};

function responder(status: number, cuerpo: unknown) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
