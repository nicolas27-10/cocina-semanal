import type { APIRoute } from 'astro';
import { z } from 'zod';
import { RecetaIA, erroresLegibles } from '@/lib/schemas';

export const prerender = false;

const Guardar = z.object({ recetas: z.array(RecetaIA).min(1).max(7) });

/**
 * Guarda recetas (vengan de la IA o del formulario manual).
 *
 * Existe como ruta de servidor y no como insert desde el island por una razon
 * concreta: son dos tablas y hay que resolver slug -> id. Postgres no expone
 * transacciones sobre HTTP, asi que si una receta falla a medio guardar se
 * borra la fila padre a mano antes de responder.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const { supabase, user } = locals;
  if (!user) return responder(401, { error: 'No autenticado' });

  const cuerpo = await request.json().catch(() => null);
  const parseado = Guardar.safeParse(cuerpo);
  if (!parseado.success) {
    return responder(422, { errores: erroresLegibles(parseado.error) });
  }

  const { data: ingredientes } = await supabase.from('ingredientes').select('id, slug');
  const porSlug = new Map((ingredientes ?? []).map((i) => [i.slug as string, i.id as string]));

  const guardadas: { id: string; slug: string; titulo: string }[] = [];

  for (const receta of parseado.data.recetas) {
    const faltantes = receta.ingredientes.filter((i) => !porSlug.has(i.slug));
    if (faltantes.length > 0) {
      return responder(422, {
        error: 'Hay ingredientes que no estan en el catalogo.',
        slugs: faltantes.map((f) => f.slug),
      });
    }

    const slug = await slugLibre(supabase, user.id, slugificar(receta.titulo));

    const { data: fila, error: errorReceta } = await supabase
      .from('recetas')
      .insert({
        user_id: user.id,
        slug,
        titulo: receta.titulo,
        resumen: receta.resumen,
        porciones: receta.porciones,
        min_prep: receta.min_prep,
        min_coccion: receta.min_coccion,
        pasos: receta.pasos,
        etiquetas: receta.etiquetas,
        origen: 'ia',
      })
      .select('id, slug, titulo')
      .single();

    if (errorReceta || !fila) {
      return responder(500, { error: errorReceta?.message ?? 'No se pudo guardar la receta.' });
    }

    const { error: errorIngredientes } = await supabase.from('receta_ingredientes').insert(
      receta.ingredientes.map((ing, idx) => ({
        receta_id: fila.id,
        ingrediente_id: porSlug.get(ing.slug)!,
        cantidad: ing.cantidad,
        unidad_code: ing.unidad,
        nota: ing.nota ?? null,
        orden: idx,
      })),
    );

    if (errorIngredientes) {
      // Sin transaccion: se limpia la receta huerfana antes de responder.
      await supabase.from('recetas').delete().eq('id', fila.id);
      return responder(500, { error: errorIngredientes.message });
    }

    guardadas.push({ id: fila.id, slug: fila.slug, titulo: fila.titulo });
  }

  return responder(201, { recetas: guardadas });
};

function slugificar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'receta';
}

/** El slug es unique(user_id, slug): dos "Tallarines" no pueden chocar. */
async function slugLibre(
  supabase: App.Locals['supabase'],
  userId: string,
  base: string,
): Promise<string> {
  for (let i = 0; i < 20; i += 1) {
    const intento = i === 0 ? base : `${base}-${i + 1}`;
    const { count } = await supabase
      .from('recetas')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('slug', intento);
    if ((count ?? 0) === 0) return intento;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function responder(status: number, cuerpo: unknown) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
