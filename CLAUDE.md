# CLAUDE.md

Antes de tocar nada, lee @README.md completo: tiene el modelo de datos, el
ejemplo numérico del cálculo de la lista de compras, la lista de trampas ya
resueltas y el roadmap por fases. Toda la app depende de una sola decisión de
diseño (la normalización de unidades a g/ml/un) — el README explica por qué;
no la reinventes ni la dupliques en JS.

Stack: Astro 7 (`output: 'server'`, adaptador Netlify), Tailwind 4 (plugin de
Vite, no integración de Astro), islands de React 19, Supabase (BD + auth por
magic link), Zod 4.

## Estado (actualizado 2026-09-04)

- Proyecto de Supabase real ya creado y accesible
  (`kjvdanrhjoxvpymonnxh.supabase.co`); `.env` cargado con las 4 variables.
- `astro check`: 0 errores. Esquema, RLS, seed de 121 ingredientes, auth,
  planificador con drag & drop, lista con export a WhatsApp y generador de
  recetas por IA: construidos y verificados (ver "Verificado" en el README).
- Pendiente (ver "Roadmap" en el README): UI de despensa (hoy se llena por
  SQL), UI de `tienda_productos`.

## Cosas ya diagnosticadas — no las vuelvas a investigar desde cero

- **El 302 al entrar a `/app/...` sin sesión iniciada es comportamiento
  esperado, no un bug.** `src/middleware.ts` redirige a `/login` cuando
  `context.locals.user` es `null` (líneas ~27-36). Antes de "arreglar" esto,
  confirma que el usuario completó el login por magic link
  (`/login` → correo → clic en el enlace → `/auth/callback` intercambia el
  código por sesión → recién ahí redirige a `/app`).
- Si el 302 persiste **después** de loguearse (o sea, el usuario ve el nav
  como autenticado y aun así lo rebotan al navegar), ahí sí investigar:
  primero revisar que `http://localhost:4321/auth/callback` esté cargado en
  Supabase → Authentication → URL Configuration → Redirect URLs (el README ya
  lo pide en "Puesta en marcha"; confirmar que quedó guardado ahí, no solo
  documentado).
