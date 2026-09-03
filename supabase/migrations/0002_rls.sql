-- ============================================================
-- 0002  Row Level Security
-- ============================================================
-- Supabase crea las tablas con RLS APAGADO. Con la anon key en el
-- navegador, eso significa que cualquiera lee todo. Se enciende ahora,
-- antes de que entre el primer dato.
-- ============================================================

alter table unidades          enable row level security;
alter table ingredientes      enable row level security;
alter table ingrediente_alias enable row level security;
alter table recetas           enable row level security;
alter table receta_ingredientes enable row level security;
alter table planes            enable row level security;
alter table plan_entradas     enable row level security;
alter table despensa          enable row level security;
alter table listas            enable row level security;
alter table lista_items       enable row level security;
alter table tienda_productos  enable row level security;

-- ---------- catalogo: lectura global ----------

create policy "unidades: todos leen"
  on unidades for select
  to authenticated
  using (true);

-- Ves el catalogo global (user_id null) mas tus propios ingredientes.
create policy "ingredientes: catalogo global + propios"
  on ingredientes for select
  to authenticated
  using (user_id is null or user_id = auth.uid());

create policy "ingredientes: solo editas los tuyos"
  on ingredientes for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "ingredientes: solo actualizas los tuyos"
  on ingredientes for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "ingredientes: solo borras los tuyos"
  on ingredientes for delete
  to authenticated
  using (user_id = auth.uid());

create policy "alias: sigue al ingrediente"
  on ingrediente_alias for select
  to authenticated
  using (exists (
    select 1 from ingredientes i
    where i.id = ingrediente_id and (i.user_id is null or i.user_id = auth.uid())
  ));

-- ---------- contenido del usuario ----------

create policy "recetas: dueno"
  on recetas for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "planes: dueno"
  on planes for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "despensa: dueno"
  on despensa for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "listas: dueno"
  on listas for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------- tablas hijas: no tienen user_id, heredan del padre ----------
-- Los indices sobre las FK (creados en 0001) no son opcionales aca:
-- sin ellos, este exists() se ejecuta en cada fila de cada consulta.

create policy "receta_ingredientes: via receta"
  on receta_ingredientes for all
  to authenticated
  using (exists (
    select 1 from recetas r where r.id = receta_id and r.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from recetas r where r.id = receta_id and r.user_id = auth.uid()
  ));

create policy "plan_entradas: via plan"
  on plan_entradas for all
  to authenticated
  using (exists (
    select 1 from planes p where p.id = plan_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from planes p where p.id = plan_id and p.user_id = auth.uid()
  ));

create policy "lista_items: via lista"
  on lista_items for all
  to authenticated
  using (exists (
    select 1 from listas l where l.id = lista_id and l.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from listas l where l.id = lista_id and l.user_id = auth.uid()
  ));

create policy "tienda_productos: via ingrediente"
  on tienda_productos for all
  to authenticated
  using (exists (
    select 1 from ingredientes i
    where i.id = ingrediente_id and (i.user_id is null or i.user_id = auth.uid())
  ))
  with check (exists (
    select 1 from ingredientes i
    where i.id = ingrediente_id and (i.user_id is null or i.user_id = auth.uid())
  ));
