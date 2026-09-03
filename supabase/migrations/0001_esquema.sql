-- ============================================================
-- 0001  Esquema base
-- ============================================================
-- Tres unidades base y nada mas. Todo lo que el usuario escribe
-- ("2 tazas", "3 tomates", "1/2 kilo") se convierte a g, ml o un
-- antes de sumarse. Sin esto la lista de compras nunca cuadra.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- tipos ----------

-- El orden de declaracion importa: los enums de Postgres ordenan por
-- orden de declaracion, asi que este es el orden en que recorres el local.
create type pasillo as enum (
  'verduleria',
  'carniceria',
  'lacteos',
  'panaderia',
  'abarrotes',
  'congelados',
  'bebidas',
  'limpieza',
  'otros'
);

create type tiempo_comida as enum ('desayuno', 'almuerzo', 'cena', 'snack');

create type unidad_base as enum ('g', 'ml', 'un');

-- ---------- catalogo compartido ----------

create table unidades (
  code       text primary key,               -- 'kg', 'taza', 'cda'
  label      text not null,                  -- 'kilogramo', 'taza'
  base       unidad_base not null,
  a_base     numeric not null check (a_base > 0)  -- 1 kg -> 1000 g
);

comment on table unidades is
  'Catalogo global de unidades. a_base convierte a la unidad base de su familia.';

create table ingredientes (
  id            uuid primary key default gen_random_uuid(),
  -- null = ingrediente del catalogo global, visible para todos.
  user_id       uuid references auth.users on delete cascade,
  slug          text not null,
  nombre        text not null,
  pasillo       pasillo not null default 'otros',
  base          unidad_base not null,
  -- Los tres puentes que permiten convertir entre familias de unidades.
  densidad_g_ml numeric check (densidad_g_ml > 0),   -- ml -> g
  peso_unidad_g numeric check (peso_unidad_g > 0),   -- un -> g
  -- Formato de venta, en la unidad base. Malla de tomates = 500.
  pack_base     numeric check (pack_base > 0),
  -- Sal, aceite, comino: no van a la lista cada semana, solo a "revisar".
  es_basico     boolean not null default false,
  created_at    timestamptz not null default now(),
  constraint ingredientes_slug_unico unique nulls not distinct (user_id, slug)
);

create index ingredientes_user_idx on ingredientes (user_id);
create index ingredientes_pasillo_idx on ingredientes (pasillo);

-- Sinonimos: "tomates cherry" y "tomate cherry" son el mismo ingrediente.
-- Es lo que evita que la IA (o tu con apuro) duplique filas en la lista.
create table ingrediente_alias (
  ingrediente_id uuid not null references ingredientes on delete cascade,
  alias          text not null,
  primary key (ingrediente_id, alias)
);

-- ---------- recetas ----------

create table recetas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  slug          text not null,
  titulo        text not null,
  resumen       text,
  porciones     int not null check (porciones > 0),
  min_prep      int check (min_prep >= 0),
  min_coccion   int check (min_coccion >= 0),
  pasos         text[] not null default '{}',
  etiquetas     text[] not null default '{}',
  origen        text not null default 'manual' check (origen in ('manual', 'ia')),
  created_at    timestamptz not null default now(),
  unique (user_id, slug)
);

create index recetas_user_idx on recetas (user_id);

create table receta_ingredientes (
  id             uuid primary key default gen_random_uuid(),
  receta_id      uuid not null references recetas on delete cascade,
  ingrediente_id uuid not null references ingredientes,
  -- null = "a gusto". No se suma, pero tampoco desaparece: cae en "revisar".
  cantidad       numeric check (cantidad > 0),
  unidad_code    text references unidades (code),
  nota           text,                                -- 'picado fino'
  opcional       boolean not null default false,
  orden          int not null default 0,
  -- Si hay cantidad, tiene que haber unidad.
  constraint cantidad_con_unidad check (cantidad is null or unidad_code is not null)
);

create index receta_ing_receta_idx on receta_ingredientes (receta_id);
create index receta_ing_ingrediente_idx on receta_ingredientes (ingrediente_id);

-- ---------- plan semanal ----------

create table planes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  inicio_semana date not null,          -- siempre lunes; date, no timestamptz
  notas         text,
  created_at    timestamptz not null default now(),
  unique (user_id, inicio_semana)
);

create index planes_user_idx on planes (user_id);

create table plan_entradas (
  id             uuid primary key default gen_random_uuid(),
  plan_id        uuid not null references planes on delete cascade,
  dia            date not null,
  momento        tiempo_comida not null,
  receta_id      uuid references recetas on delete set null,
  -- Para "sobras del lunes" o "pedimos algo", sin receta asociada.
  texto_libre    text,
  -- Cuando cocinas para mas gente que las porciones de la receta.
  porciones_override int check (porciones_override > 0),
  unique (plan_id, dia, momento),
  constraint entrada_tiene_contenido check (receta_id is not null or texto_libre is not null)
);

create index plan_entradas_plan_idx on plan_entradas (plan_id);

-- ---------- despensa y compra ----------

create table despensa (
  user_id        uuid not null references auth.users on delete cascade,
  ingrediente_id uuid not null references ingredientes,
  cantidad       numeric not null check (cantidad >= 0),
  unidad_code    text not null references unidades (code),
  actualizado    timestamptz not null default now(),
  primary key (user_id, ingrediente_id)
);

create table listas (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  plan_id      uuid references planes on delete set null,
  generada     timestamptz not null default now()
);

create index listas_user_idx on listas (user_id);

create table lista_items (
  id             uuid primary key default gen_random_uuid(),
  lista_id       uuid not null references listas on delete cascade,
  ingrediente_id uuid references ingredientes,
  etiqueta       text not null,          -- congelado, para que la lista sobreviva
  pasillo        pasillo not null,
  -- Siempre en unidad base. El formato ("1,5 kg") lo hace la UI con Intl.
  cantidad_base  numeric,
  base           unidad_base,
  -- 'plan' lo calculo yo, 'manual' lo agregaste tu, 'revisar' = no pude
  -- convertir la unidad o la receta decia "a gusto".
  origen         text not null default 'plan'
                 check (origen in ('plan', 'manual', 'revisar')),
  marcado        boolean not null default false,
  orden          int not null default 0
);

create index lista_items_lista_idx on lista_items (lista_id);

-- ---------- puente a la tienda (fase B del roadmap) ----------
-- El dato vive en tu base, no en un scraper. Lo llenas una vez por
-- ingrediente y la lista pasa de "arroz 2 kg" a "Arroz grado 2, 1 kg x 2".
create table tienda_productos (
  ingrediente_id uuid not null references ingredientes on delete cascade,
  tienda         text not null default 'lider',
  nombre         text not null,
  url            text,
  precio_clp     int check (precio_clp >= 0),
  contenido_base numeric check (contenido_base > 0),
  actualizado    timestamptz not null default now(),
  primary key (ingrediente_id, tienda)
);
