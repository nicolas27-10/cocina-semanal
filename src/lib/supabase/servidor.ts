import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from 'astro:env/client';
import type { APIContext, AstroCookieSetOptions } from 'astro';

/**
 * Cliente Supabase para el servidor.
 *
 * AstroCookies no expone getAll(), asi que las cookies de entrada se leen del
 * header del request y las de salida se escriben con cookies.set(). Este puente
 * es lo que mantiene la sesion viva entre SSR y el navegador: sin el, el island
 * sabe quien eres y el servidor no.
 */
export function clienteServidor(context: Pick<APIContext, 'request' | 'cookies'>) {
  return createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(context.request.headers.get('Cookie') ?? '').map(
          ({ name, value }) => ({ name, value: value ?? '' }),
        );
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          context.cookies.set(name, value, options as AstroCookieSetOptions);
        }
      },
    },
  });
}
