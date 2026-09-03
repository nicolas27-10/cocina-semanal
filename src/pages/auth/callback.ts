import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * Intercambia el code del magic link por una sesion y la escribe en cookies.
 * Que esto pase en el SERVIDOR es lo que hace que el SSR sepa quien eres:
 * si el intercambio ocurriera solo en el navegador, cada navegacion volveria
 * a renderizar como anonimo.
 */
export const GET: APIRoute = async ({ url, locals, redirect }) => {
  const code = url.searchParams.get('code');
  const volver = url.searchParams.get('volver') ?? '/app';

  if (!code) {
    return redirect(`/login?error=${encodeURIComponent('Falta el codigo del enlace.')}`);
  }

  const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  return redirect(volver.startsWith('/') ? volver : '/app');
};
