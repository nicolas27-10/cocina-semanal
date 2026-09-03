-- ============================================================
-- Seed: unidades
-- ============================================================
-- "taza" en recetas chilenas ronda los 240 ml. Si tu familia mide
-- con otra taza, cambia el a_base aca y toda la app se recalcula.
-- ============================================================
insert into unidades (code, label, base, a_base) values
  ('g',         'gramo',        'g',  1),
  ('kg',        'kilogramo',    'g',  1000),
  ('mg',        'miligramo',    'g',  0.001),
  ('ml',        'mililitro',    'ml', 1),
  ('cc',        'centimetro cubico', 'ml', 1),
  ('l',         'litro',        'ml', 1000),
  ('taza',      'taza',         'ml', 240),
  ('cda',       'cucharada',    'ml', 15),
  ('cdta',      'cucharadita',  'ml', 5),
  ('un',        'unidad',       'un', 1),
  ('docena',    'docena',       'un', 12),
  ('diente',    'diente',       'un', 1),
  ('ramita',    'ramita',       'un', 1),
  ('hoja',      'hoja',         'un', 1),
  ('rebanada',  'rebanada',     'un', 1),
  ('tarro',     'tarro',        'un', 1),
  ('sobre',     'sobre',        'un', 1)
on conflict (code) do update
  set label = excluded.label, base = excluded.base, a_base = excluded.a_base;
