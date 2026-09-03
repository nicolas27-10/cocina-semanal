import type { APIRoute } from 'astro';
import { PedidoLista, erroresLegibles } from '@/lib/schemas';

export const prerender = false;

/**
 * Dispara la funcion de Postgres. Toda la aritmetica (escalar, convertir,
 * sumar, restar despensa, redondear al formato de venta) pasa dentro de la
 * base en una transaccion. Aca no se calcula nada: si se calculara en JS
 * habria dos implementaciones de la misma regla y una de las dos estaria mal.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const { supabase, user } = locals;
  if (!user) return responder(401, { error: 'No autenticado' });

  const cuerpo = await request.json().catch(() => null);
  const parseado = PedidoLista.safeParse(cuerpo);
  if (!parseado.success) {
    return responder(422, { errores: erroresLegibles(parseado.error) });
  }

  const { data, error } = await supabase.rpc('generar_lista', {
    p_plan_id: parseado.data.plan_id,
  });

  if (error) {
    // 42501 es el errcode que levanta la funcion cuando el plan no es tuyo.
    const status = error.code === '42501' ? 403 : 500;
    return responder(status, { error: error.message });
  }

  return responder(201, { lista_id: data });
};

function responder(status: number, cuerpo: unknown) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
