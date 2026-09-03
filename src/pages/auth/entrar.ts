import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * Magic link. El correo lo manda Supabase; aca solo se pide.
 * Ojo: hay que agregar el dominio de Netlify en
 * Supabase > Authentication > URL Configuration > Redirect URLs,
 * o el enlace del correo va a rebotar en produccion.
 */
export const POST: APIRoute = async ({ request, locals, url, redirect }) => {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim();
  const volver = String(form.get('volver') ?? '/app');

  if (!email.includes('@')) {
    return redirect(`/login?error=${encodeURIComponent('Ese correo no se ve bien.')}`);
  }

  const { error } = await locals.supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${url.origin}/auth/callback?volver=${encodeURIComponent(volver)}`,
    },
  });

  if (error) {
    return redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
  return redirect('/login?enviado=1');
};
