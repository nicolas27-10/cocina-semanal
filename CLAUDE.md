# CLAUDE.md

Antes de tocar nada, lee @README.md completo: tiene el modelo de datos, el
ejemplo numérico del cálculo de la lista de compras, la lista de trampas ya
resueltas y el roadmap por fases. Toda la app depende de una sola decisión de
diseño (la normalización de unidades a g/ml/un) — el README explica por qué;
no la reinventes ni la dupliques en JS.

Stack: Astro 7 (`output: 'server'`, adaptador Netlify), Tailwind 4 (plugin de
Vite, no integración de Astro), islands de React 19, Supabase (BD + auth por
magic link), Zod 4.

## Estado (actualizado 2026-09-08)

- Proyecto de Supabase real ya creado y accesible
  (`kjvdanrhjoxvpymonnxh.supabase.co`); `.env` cargado con las 4 variables.
- `astro check`: 0 errores. Esquema, RLS, seed de 121 ingredientes, auth,
  planificador con drag & drop, lista con export a WhatsApp y generador de
  recetas por IA: construidos y verificados (ver "Verificado" en el README).
- **El proveedor de IA es Gemini, no Anthropic.** La cuenta de Anthropic del
  usuario es de empresa y no puede generar una API key personal, así que
  `src/lib/ia/cliente.ts` usa `@google/genai` (`GEMINI_API_KEY`,
  `IA_MODELO=gemini-3.1-flash-lite`, tier gratuito). El resto de la app
  (schemas, endpoint, UI) no cambió — solo el cliente. Internamente
  `generarRecetas()` hace **dos** llamadas (recetas, después ingredientes) y
  las reagrupa; ver el porqué en "La capa de IA" del README y el diagnóstico
  de abajo — no lo rediseñes a una sola llamada sin releer eso primero.
- El generador de recetas por IA ahora también está embebido en
  `/app/semana/[semana]` (dentro de `PlanificadorSemana.tsx`, botón
  "+ Generar con IA" en el panel de recetas), no solo en `/app/recetas`. Al
  guardar, la receta generada queda preseleccionada para asignarla directo a
  una casilla sin recargar la página.
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
- **"El modelo no respondio." al generar recetas — revisar el log del
  servidor primero** (`npx astro dev logs`), el mensaje real está ahí, no en
  lo que ve el usuario en pantalla. Dos causas ya vistas, distintas entre sí:
  - **404 "This model ... is no longer available"**: `IA_MODELO` apunta a un
    modelo de Gemini descontinuado. El corte de conocimiento del asistente
    sobre nombres de modelos de Gemini quedó viejo el 2026-09-08
    (`gemini-2.0-flash` y `gemini-2.5-flash` ya no existían ese día). El
    mensaje de error trae el nombre vigente (`Please use models/...`); ese es
    el valor correcto para `IA_MODELO`. Con la API key ya en `.env`, listar
    modelos vigentes corriendo un script Node suelto que llama
    `new GoogleGenAI({apiKey}).models.list()` y filtra por
    `supportedActions.includes('generateContent')` — más confiable que
    adivinar o que preguntarle al asistente, cuyo conocimiento de nombres de
    modelo tiene fecha de corte.
  - **400 "Request contains an invalid argument"** (sin más detalle en el
    mensaje): esto **no** es un problema de modelo ni de API key — es un
    límite no documentado del `responseSchema` de Gemini con schemas
    complejos. Confirmado a mano contra la API real el 2026-09-08: un array
    de objetos (`items.type === 'object'`) con `minItems`/`maxItems` Y varias
    properties con constraints (`minLength`, `minimum`/`maximum`, etc.)
    dispara el 400; el mismo array sin `minItems`/`maxItems`, o con un solo
    campo, funciona. `esquemaGemini()` en `cliente.ts` ya omite
    `minItems`/`maxItems` en cualquier array-de-objetos por esto — si el 400
    vuelve a aparecer, es porque `SemanaIA` (o el schema que sea) creció en
    complejidad de nuevo por encima de ese límite; la solución probada es
    partir la generación en llamadas más chicas (como ya se hizo: recetas
    primero, ingredientes después, reagrupados por `receta_idx`), no seguir
    recortando campos del schema al voleo. Para depurar esto de nuevo: un
    script Node suelto (fuera de `src/`, con el mismo `esquemaGemini()`
    copiado) que llama `ai.models.generateContent()` directo es mucho más
    rápido que iterar desde la UI — permite ver el schema exacto enviado y
    aislar qué combinación de campos dispara el 400. Cuidado con la cuota:
    el tier gratis es de pocas llamadas por minuto y por día (varía por
    modelo, `gemini-3.1-flash-lite` fue el más permisivo en las pruebas).
- Astro **no** recarga `astro:env/server` en caliente al editar `.env`: hay
  que esperar a que el dev server detecte el cambio y reinicie solo
  (log: `.env changed, restarting server...`) o reiniciarlo a mano. Un
  "no respondio" justo después de pegar una API key nueva puede ser
  simplemente que el proceso viejo todavía tiene la key vacía en memoria.
