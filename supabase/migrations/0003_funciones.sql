-- ============================================================
-- 0003  Conversion de unidades y generacion de la lista
-- ============================================================

-- ------------------------------------------------------------
-- convertir_a_base
-- ------------------------------------------------------------
-- Los tres puentes entre familias de unidades:
--   densidad_g_ml  ml <-> g   ("1 taza de leche" -> 244 g)
--   peso_unidad_g  un <-> g   ("3 tomates"       -> 450 g)
--   ambos          ml <-> un
-- Si falta el puente devuelve null: el ingrediente NO se suma mal,
-- cae en la lista marcado como 'revisar'. Nada desaparece en silencio.
-- ------------------------------------------------------------
create or replace function convertir_a_base(
  p_cantidad      numeric,
  p_unidad_base   unidad_base,
  p_unidad_a_base numeric,
  p_ing_base      unidad_base,
  p_densidad      numeric,
  p_peso_unidad   numeric
) returns numeric
language sql
immutable
as $$
  select case
    when p_cantidad is null or p_unidad_base is null then null

    -- misma familia: solo el factor de la unidad
    when p_unidad_base = p_ing_base
      then p_cantidad * p_unidad_a_base

    -- volumen <-> peso
    when p_unidad_base = 'ml' and p_ing_base = 'g' and p_densidad is not null
      then p_cantidad * p_unidad_a_base * p_densidad
    when p_unidad_base = 'g' and p_ing_base = 'ml' and p_densidad is not null
      then p_cantidad * p_unidad_a_base / p_densidad

    -- unidad <-> peso
    when p_unidad_base = 'un' and p_ing_base = 'g' and p_peso_unidad is not null
      then p_cantidad * p_unidad_a_base * p_peso_unidad
    when p_unidad_base = 'g' and p_ing_base = 'un' and p_peso_unidad is not null
      then p_cantidad * p_unidad_a_base / p_peso_unidad

    -- volumen <-> unidad (necesita los dos puentes)
    when p_unidad_base = 'ml' and p_ing_base = 'un'
         and p_densidad is not null and p_peso_unidad is not null
      then p_cantidad * p_unidad_a_base * p_densidad / p_peso_unidad
    when p_unidad_base = 'un' and p_ing_base = 'ml'
         and p_densidad is not null and p_peso_unidad is not null
      then p_cantidad * p_unidad_a_base * p_peso_unidad / p_densidad

    else null
  end;
$$;

-- ------------------------------------------------------------
-- redondear_a_pack
-- ------------------------------------------------------------
-- La receta pide 1003 g de tomate; se vende en mallas de 500 g.
-- Compras 1500 g, no 1003.
-- ------------------------------------------------------------
create or replace function redondear_a_pack(p_cantidad numeric, p_pack numeric)
returns numeric
language sql
immutable
as $$
  select case
    when p_cantidad is null then null
    when p_pack is null or p_pack <= 0 then p_cantidad
    else ceil(p_cantidad / p_pack) * p_pack
  end;
$$;

-- ------------------------------------------------------------
-- generar_lista
-- ------------------------------------------------------------
-- Toda la cadena en una transaccion:
--   escalar por porciones -> convertir a base -> sumar por ingrediente
--   -> restar despensa -> redondear a formato de venta -> materializar
--
-- Se materializa en filas (no es una vista) por tres razones:
--   1. los checkboxes tienen que persistir
--   2. puedes agregar items a mano ("papel confort")
--   3. la lista no debe cambiar bajo tus pies si editas una receta el jueves
--
-- security invoker + RLS: si el plan no es tuyo, el select inicial vuelve
-- vacio y la funcion aborta. No hace falta chequear permisos a mano.
-- ------------------------------------------------------------
create or replace function generar_lista(p_plan_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id  uuid;
  v_lista_id uuid;
begin
  select user_id into v_user_id from planes where id = p_plan_id;
  if v_user_id is null then
    raise exception 'El plan % no existe o no te pertenece', p_plan_id
      using errcode = '42501';
  end if;

  insert into listas (user_id, plan_id)
  values (v_user_id, p_plan_id)
  returning id into v_lista_id;

  insert into lista_items
    (lista_id, ingrediente_id, etiqueta, pasillo, cantidad_base, base, origen, orden)
  with crudo as (
    -- una fila por ingrediente por comida de la semana, ya escalado y en base
    select
      ri.ingrediente_id,
      convertir_a_base(
        ri.cantidad * coalesce(e.porciones_override, r.porciones)::numeric / r.porciones,
        u.base, u.a_base,
        i.base, i.densidad_g_ml, i.peso_unidad_g
      ) as base_qty
    from plan_entradas e
    join recetas r               on r.id  = e.receta_id
    join receta_ingredientes ri  on ri.receta_id = r.id
    join ingredientes i          on i.id  = ri.ingrediente_id
    left join unidades u         on u.code = ri.unidad_code
    where e.plan_id = p_plan_id
      and ri.opcional = false
  ),
  sumado as (
    select
      ingrediente_id,
      sum(base_qty)                                as cuantificado,
      count(*) filter (where base_qty is null)     as sin_puente
    from crudo
    group by ingrediente_id
  ),
  neto as (
    select
      s.ingrediente_id,
      s.cuantificado,
      s.sin_puente,
      -- lo que ya tienes en casa se resta antes de redondear
      greatest(
        coalesce(s.cuantificado, 0) - coalesce(
          convertir_a_base(
            d.cantidad, du.base, du.a_base,
            i.base, i.densidad_g_ml, i.peso_unidad_g
          ), 0
        ),
        0
      ) as por_comprar
    from sumado s
    join ingredientes i    on i.id = s.ingrediente_id
    left join despensa d   on d.ingrediente_id = s.ingrediente_id
                          and d.user_id = v_user_id
    left join unidades du  on du.code = d.unidad_code
  )
  select
    v_lista_id,
    n.ingrediente_id,
    i.nombre,
    i.pasillo,
    case when n.cuantificado is null then null
         else redondear_a_pack(n.por_comprar, i.pack_base) end,
    case when n.cuantificado is null then null else i.base end,
    case when n.cuantificado is null then 'revisar' else 'plan' end,
    -- el orden del enum pasillo es el orden en que recorres el local
    row_number() over (order by i.pasillo, i.nombre)
  from neto n
  join ingredientes i on i.id = n.ingrediente_id
  -- si la despensa lo cubre entero, no va a la lista; si no se pudo
  -- cuantificar, si va (como 'revisar')
  where n.cuantificado is null or n.por_comprar > 0;

  return v_lista_id;
end;
$$;

grant execute on function generar_lista(uuid) to authenticated;
grant execute on function convertir_a_base(numeric, unidad_base, numeric, unidad_base, numeric, numeric) to authenticated;
grant execute on function redondear_a_pack(numeric, numeric) to authenticated;

-- ------------------------------------------------------------
-- Vista de diagnostico: ingredientes que usas en recetas pero que no
-- se pueden convertir por falta de densidad o peso por unidad.
-- Cada fila aca es una linea que va a aparecer como 'revisar'.
-- ------------------------------------------------------------
create or replace view ingredientes_sin_puente
with (security_invoker = true)
as
select distinct
  i.id,
  i.slug,
  i.nombre,
  i.base        as base_ingrediente,
  u.code        as unidad_usada,
  u.base        as base_unidad,
  case
    when u.base = 'ml' and i.base = 'g' then 'falta densidad_g_ml'
    when u.base = 'un' and i.base = 'g' then 'falta peso_unidad_g'
    when u.base = 'g'  and i.base = 'un' then 'falta peso_unidad_g'
    else 'faltan densidad_g_ml y peso_unidad_g'
  end as falta
from receta_ingredientes ri
join ingredientes i on i.id = ri.ingrediente_id
join unidades u     on u.code = ri.unidad_code
where ri.cantidad is not null
  and convertir_a_base(ri.cantidad, u.base, u.a_base, i.base, i.densidad_g_ml, i.peso_unidad_g) is null;
