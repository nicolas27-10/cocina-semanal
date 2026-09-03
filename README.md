# Cocina Semanal

Planificador de menú semanal, recetario y lista de compras calculada.
Astro + Tailwind 4 + Supabase + Zod, con generación de recetas por IA.
Despliegue en Netlify.

---

## La idea en una línea

Armas la semana arrastrando recetas a 21 casillas; la lista de compras se
calcula sumando los ingredientes de todas ellas, convirtiéndolos a una misma
unidad, restando lo que ya hay en la despensa y redondeando al formato en que
el producto se vende.

## Lo que decide si esto funciona

No es la IA. Es la **normalización de unidades**.

Una receta dice `400 g de tomate`, otra dice `3 tomates`, otra dice
`1 taza de tomate picado`. Si no puedes sumar las tres, la lista de compras
siempre va a estar mal, y una lista mal calculada no se usa dos veces.

La solución está en tres columnas de `ingredientes`:

| Columna | Convierte | Ejemplo |
|---|---|---|
| `densidad_g_ml` | ml → g | harina: 0,53 g/ml, así `1 taza` = 240 ml = 127 g |
| `peso_unidad_g` | un → g | tomate: 150 g, así `3 un` = 450 g |
| `pack_base` | cantidad → formato de venta | tomate: malla de 500 g |

Todo se guarda en **g, ml o un** y nada más. El formato bonito (`1,5 kg`) se
arma en la UI con `Intl.NumberFormat('es-CL')`, nunca en la base de datos.

Ejemplo real de la cadena completa, para el tomate de una semana:

```
Tallarines (4 porc.)   400 g                                    →   400 g
Ensalada  (2→3 porc.)  3 un    × 150 g/un  × 3/2 porciones      →   675 g
Pebre     (4 porc.)    1 taza  × 240 ml/taza  × 0,95 g/ml       →   228 g
                                                                  ────────
                                                         suma       1.303 g
                                             despensa (2 un)      −   300 g
                                                                  ────────
                                                                    1.003 g
                                  ceil() a mallas de 500 g       →  1.500 g
```

Eso es lo que hace `generar_lista()` en `supabase/migrations/0003_funciones.sql`,
dentro de una transacción. **Nada de esa aritmética está duplicada en JS**: si
estuviera en los dos lados, una de las dos copias estaría mal.

Cuando falta un puente (`1 taza de X` sin densidad) la función **no adivina**:
devuelve `null` y el ítem aparece en la lista marcado como `revisar`. Nada
desaparece en silencio. La vista `ingredientes_sin_puente` te dice exactamente
qué dato completar.

---

## Puesta en marcha

### 1. Dependencias

```bash
npm install
```

### 2. Supabase

Crea un proyecto en [supabase.com](https://supabase.com) (el plan gratis
alcanza de sobra para una casa) y corre los archivos **en este orden** desde
el SQL Editor:

```
supabase/migrations/0001_esquema.sql     tablas, tipos, índices
supabase/migrations/0002_rls.sql         row level security
supabase/migrations/0003_funciones.sql   conversión y generación de la lista
supabase/seed/0010_unidades.sql          17 unidades
supabase/seed/0011_ingredientes.sql      121 ingredientes de supermercado chileno
```

O con la CLI, si prefieres tener las migraciones versionadas:

```bash
npx supabase link --project-ref <tu-ref>
npx supabase db push
```

> **RLS**: Supabase crea las tablas con row level security **apagada**. Con la
> anon key expuesta en el navegador, eso significa que cualquiera lee todo.
> `0002_rls.sql` la enciende. Córrelo antes de que entre el primer dato.

En **Authentication → URL Configuration → Redirect URLs** agrega
`http://localhost:4321/auth/callback` y la URL de Netlify cuando despliegues,
o el enlace del correo va a rebotar.

### 3. Variables de entorno

```bash
cp .env.example .env
```

| Variable | De dónde sale |
|---|---|
| `PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `PUBLIC_SUPABASE_ANON_KEY` | idem |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) (opcional: sin esto todo funciona menos generar recetas) |
| `IA_MODELO` | opcional, por defecto un modelo de la gama económica |

El prefijo `PUBLIC_` no es cosmético: `astro.config.mjs` declara las variables
con `envField`, y `ANTHROPIC_API_KEY` está marcada
`context: 'server', access: 'secret'`. Si algún día la importas por accidente
desde un island, **el build falla** en vez de publicar tu key.

### 4. Correr

```bash
npm run dev      # http://localhost:4321
npm run check    # tipos (astro check)
npm run build    # build de producción
```

### 5. Netlify

Conecta el repo. El adaptador ya está configurado; `netlify.toml` trae el build
command y los headers. Solo hay que cargar las cuatro variables de entorno en
**Site configuration → Environment variables**.

---

## Estructura

```
astro.config.mjs          output: 'server' + adaptador Netlify + envField
netlify.toml              build y headers de seguridad

supabase/
  migrations/             esquema, RLS, funciones
  seed/                   unidades e ingredientes

src/
  middleware.ts           resuelve la sesión y protege /app y /api

  lib/
    supabase/servidor.ts  cliente SSR (puentea cookies ↔ AstroCookies)
    supabase/navegador.ts cliente para islands (singleton)
    schemas.ts            Zod: un schema → JSON Schema de la tool + validación
    semana.ts             fechas de semana (date, no timestamptz)
    unidades.ts           formato es-CL
    tipos.ts              tipos que cruzan de .astro a los islands
    ia/prompts.ts         system prompt + bloque de catálogo
    ia/cliente.ts         la única llamada al modelo que existe
    tienda/proveedor.ts   interfaz ProveedorTienda (fase Lider)

  pages/
    index.astro           landing — prerender: estática, sin función
    login.astro           magic link
    auth/                 entrar · callback · salir
    app/semana/[semana]   el planificador
    app/recetas/          recetario + generador
    app/lista/[id]        la lista de compras
    api/recetas/generar   ← la ÚNICA ruta que existe por la key
    api/recetas/index     guardar recetas (dos tablas)
    api/lista/generar     dispara generar_lista()
    api/menu/entrada      mover comidas del plan

  islands/
    PlanificadorSemana.tsx  grilla 7×N con dnd-kit
    ListaCompras.tsx        lista agrupada por pasillo
    GeneradorReceta.tsx     formulario del generador
```

### Por qué hay tan pocas rutas de API

Las policies de RLS ya restringen las filas por usuario, así que los islands
hablan **directo** con Supabase para leer y para cosas simples (marcar un ítem
de la lista). Una ruta intermedia solo agregaría latencia y otro archivo que
mantener.

Las cuatro rutas que existen tienen cada una una razón concreta:

- `api/recetas/generar` — **la key no puede vivir en el navegador.** Esta es la
  razón de fondo por la que el proyecto es SSR y no estático.
- `api/recetas/index` — son dos tablas y hay que resolver `slug → id`.
- `api/lista/generar` — dispara la función de Postgres.
- `api/menu/entrada` — upsert con `onConflict` sobre la clave única.

---

## La capa de IA

Toda la "capa de IA" son ~90 líneas en `src/lib/ia/`. **No hay** vector store,
embeddings, RAG, ni framework de agentes. Es un POST con un JSON Schema.

Tres decisiones que hacen la diferencia:

**1. El catálogo restringe al modelo.** Antes de llamar, la ruta lee los slugs
reales de tu base y los mete en el prompt: *usa SOLO estos*. Un modelo que no
puede nombrar un ingrediente inexistente no puede romper tu lista de compras.
Igual se verifica al volver: si inventó un slug, se reporta en pantalla y
**no se guarda nada**.

**2. Un solo Zod define la forma.** `src/lib/schemas.ts` tiene `RecetaIA`, y
ese mismo objeto se usa para dos cosas:

```ts
z.toJSONSchema(SemanaIA)   // → el input_schema de la tool que el modelo llena
SemanaIA.safeParse(input)  // → valida lo que volvió, antes de tocar la BD
```

Con `tool_choice: { type: 'tool', name: 'entregar_recetas' }` el modelo está
**obligado** a responder con esa forma; no puede contestar en prosa. Y los
`.describe()` de cada campo no son comentarios: viajan al JSON Schema y el
modelo los lee. Son prompt.

Los `.max()` tampoco son cosméticos. Un modelo puede escribir `500 kg de sal`
con total seguridad; sin el límite, eso entra a tu lista.

**3. Lo que realmente vale.** La IA no está para inventar recetas exóticas: está
para **optimizar el conjunto**. Con `reusar_ingredientes` activado se le pide
que los N platos compartan la mayor cantidad de ingredientes posible, que no
repita proteína dos días seguidos y que parta de la despensa. Resultado: la
compra es corta y no sobra media bolsa de cilantro. Eso es lo que un modelo hace
bien y a mano cuesta.

El bloque del catálogo va con `cache_control: 'ephemeral'`: no cambia entre
llamadas, así que se cachea y se deja de pagar.

**Costo real**: una receta son ~1.500 tokens de salida. Una semana completa,
centavos de dólar. Para una casa esto son cifras despreciables.

---

## Lider: qué es realista

Tres niveles, de más a menos seguro:

**A — Lista ordenada por pasillo. Funciona hoy.**
El enum `pasillo` está declarado en el orden en que recorres el local, y los
enums de Postgres ordenan por orden de declaración. La lista sale en ese orden
y se exporta como texto para WhatsApp. Cero dependencias externas.

**B — Vínculo manual, pero persistente.** La tabla `tienda_productos`. Lo llenas
una vez por ingrediente y la lista pasa de `arroz — 2 kg` a
`Arroz grado 2, 1 kg × 2`, con precio para estimar el total del mes. Es estable
porque **el dato vive en tu base**, no en un scraper.

**C — Carrito automático. Frágil.**
No conozco una API pública de Lider que permita a un cliente agregar productos
a su carrito desde una app propia; el programa de desarrolladores de Walmart
apunta a vendedores de su marketplace, no a esto. Conviene que lo verifiques por
tu cuenta antes de contar con ello. Lo que queda es automatizar el navegador
(Playwright) en tu propia máquina con tu sesión: se rompe cada vez que cambien
el HTML y probablemente choque con los términos de uso del sitio. Trátalo como
un script personal tuyo, nunca como una función del producto.

Por eso la app **no depende de que exista**: solo conoce la interfaz
`ProveedorTienda` en `src/lib/tienda/proveedor.ts`. `agregarAlCarrito` es
opcional a propósito, y la UI pregunta si existe antes de mostrar el botón.
Si algún día aparece una API, cambia una implementación y nada más.

---

## Roadmap

| | Fase | Estado |
|---|---|---|
| 0 | Esquema, RLS, catálogo de ingredientes, auth | **listo** |
| 1 | Planificador semanal, recetario | **listo** |
| 2 | Lista de compras con conversión y despensa | **listo** |
| 3 | Generación de recetas por IA | **listo** (falta tu API key) |
| 4 | Planificar la semana reusando ingredientes | **listo** (`cantidad > 1`) |
| 5 | Vínculo a productos y precios (`tienda_productos`) | tabla lista, UI pendiente |
| 6 | UI de despensa (hoy se llena por SQL) | pendiente |
| 7 | Experimentos de automatización del carrito | evaluar |

Lo importante del orden: la fase 3 **depende** de que las fases 0-2 estén
sólidas. Si el catálogo y la conversión no funcionan, la IA genera recetas que
no se pueden sumar, y la app no sirve para nada.

---

## Trampas que ya están resueltas

- **RLS apagada por defecto** → `0002_rls.sql`, antes del primer dato.
- **`unique nulls not distinct`** en `ingredientes` → sin eso, dos ingredientes
  globales con el mismo slug pasan, porque en Postgres los `NULL` son distintos
  entre sí.
- **Índices sobre las FK** → las policies usan `exists()` sobre la tabla padre;
  sin índice eso se ejecuta por fila en cada consulta.
- **Auth partida en dos** → el error clásico es hacer login en un island y que
  el servidor no sepa quién eres. `@supabase/ssr` + `src/middleware.ts` +
  `auth/callback.ts` en el servidor lo resuelven.
- **`context.isPrerendered`** en el middleware → sin esa salida temprana, el
  build de la landing estática intenta leer cookies que no existen.
- **Astro estático por defecto** → decidido de entrada: `output: 'server'` con
  `prerender = true` sólo en la landing.
- **Escalar por porciones** → se guarda `porciones` en la receta y se escala al
  generar; nunca cantidades absolutas.
- **Horario de verano** → `inicio_semana` es `date`, no `timestamptz`. Chile
  cambia de hora dos veces al año; con zona horaria, dos veces al año la semana
  empezaría el domingo a las 23:00.
- **Tailwind 4** → se instala como plugin de Vite (`@tailwindcss/vite`), no como
  integración de Astro. La integración vieja es para v3.
- **Formato de números** → la BD guarda `1500`, la UI muestra `1,5 kg`. Un solo
  lugar decide el formato.
- **`npm audit`** avisa de vulnerabilidades en dependencias transitivas del
  adaptador de Netlify (`extract-zip`, `image-size`), usadas por su servidor de
  desarrollo local. No corras `audit fix --force`: bajaría el adaptador a una
  versión incompatible con Astro 7.

## Costos

| | |
|---|---|
| Supabase | plan gratis (500 MB, auth incluida) |
| Netlify | plan gratis |
| API del modelo | centavos al mes |
| **Total** | **~USD 0** |

---

## Verificado

El esquema, las policies y el cálculo se probaron contra un Postgres 16 real
antes de entregarse:

- las 3 migraciones y los 2 seeds corren en orden sin un solo error
- el caso del tomate del README da exactamente **1.500 g**
- un `"a gusto"` termina en `revisar` con cantidad `null`, no desaparece
- un segundo usuario ve **0** recetas, planes, listas y despensa del primero,
  y sí ve los 121 ingredientes del catálogo global
- `generar_lista()` sobre un plan ajeno aborta con
  `"El plan ... no existe o no te pertenece"`
- `ingredientes_sin_puente` detecta correctamente un `1 taza` sin densidad

`npm run check` (astro check): **0 errores, 0 warnings, 0 hints**.
`npm run build`: limpio.
