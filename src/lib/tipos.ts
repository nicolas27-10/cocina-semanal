import type { Momento } from '@/lib/semana';
import type { UnidadBase } from '@/lib/unidades';

/** Tipos que cruzan la frontera entre las paginas .astro y los islands. */

export type RecetaResumen = {
  id: string;
  slug: string;
  titulo: string;
  porciones: number;
  min_prep: number | null;
  min_coccion: number | null;
  etiquetas: string[];
  origen: string;
};

export type EntradaPlan = {
  id: string;
  dia: string;
  momento: Momento;
  receta_id: string | null;
  texto_libre: string | null;
  porciones_override: number | null;
  titulo: string | null;
};

export type ItemLista = {
  id: string;
  etiqueta: string;
  pasillo: string;
  cantidad_base: number | null;
  base: UnidadBase | null;
  origen: 'plan' | 'manual' | 'revisar';
  marcado: boolean;
  pack_base: number | null;
};
