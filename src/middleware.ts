import { defineMiddleware } from 'astro:middleware';
import { clienteServidor } from '@/lib/supabase/servidor';

const RUTAS_PRIVADAS = ['/app', '/api'];
const API_PUBLICA = ['/api/health'];

export const onRequest = defineMiddleware(async (context, next) => {
  // Las paginas prerenderizadas se generan en el build, donde no hay request
  // ni cookies. Sin esta salida temprana, el build intenta leer la sesion y
  // avisa que Astro.request.headers no existe.
  if (context.isPrerendered) return next();

  const supabase = clienteServidor(context);
  context.locals.supabase = supabase;

  // getUser() valida el JWT contra Supabase en cada request. Es una llamada
  // de red por navegacion: el precio de no confiar en una cookie que el
  // navegador puede editar. No lo cambies por getSession().
  const { data, error } = await supabase.auth.getUser();
  if (error && error.name !== 'AuthSessionMissingError') {
    // Sin este log, un refresh token invalidado (rotacion, reuse-interval de
    // Supabase, o sesion revocada) se ve igual que "nunca inicio sesion": un
    // 302 a /login sin pista de por que. Con esto queda en la consola del
    // servidor la razon real la proxima vez que pase.
    console.error(`[auth] getUser() fallo en ${context.url.pathname}: ${error.name} - ${error.message}`);
  }
  context.locals.user = data.user ?? null;

  const { pathname } = context.url;
  const esPrivada =
    RUTAS_PRIVADAS.some((p) => pathname.startsWith(p)) &&
    !API_PUBLICA.some((p) => pathname.startsWith(p));

  if (esPrivada && !context.locals.user) {
    // Las rutas de API responden 401; las paginas redirigen al login.
    if (pathname.startsWith('/api')) {
      return new Response(JSON.stringify({ error: 'No autenticado' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }
    return context.redirect(`/login?volver=${encodeURIComponent(pathname)}`);
  }

  return next();
});
