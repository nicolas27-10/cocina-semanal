export type UnidadBase = 'g' | 'ml' | 'un';

/**
 * La base de datos guarda numeros en unidad base (g, ml, un) y nada mas.
 * El formato vive aca, en la UI, con la configuracion regional chilena:
 * separador de miles con punto y decimal con coma.
 */
const nf = (decimales: number) =>
  new Intl.NumberFormat('es-CL', { maximumFractionDigits: decimales });

const clp = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});

export function formatearCantidad(cantidad: number | null, base: UnidadBase | null): string {
  if (cantidad === null || base === null) return 'a revisar';

  if (base === 'un') {
    return `${nf(0).format(Math.ceil(cantidad))} un`;
  }
  if (cantidad >= 1000) {
    // 1500 g -> "1,5 kg"; 2000 ml -> "2 L"
    return `${nf(2).format(cantidad / 1000)} ${base === 'g' ? 'kg' : 'L'}`;
  }
  return `${nf(0).format(Math.round(cantidad))} ${base}`;
}

/** "3 x 500 g" cuando el producto se vende en formato fijo. */
export function formatearFormato(
  cantidadBase: number | null,
  packBase: number | null,
  base: UnidadBase | null,
): string | null {
  if (cantidadBase === null || !packBase || base === null) return null;
  const packs = Math.round(cantidadBase / packBase);
  if (packs <= 1) return null;
  return `${packs} x ${formatearCantidad(packBase, base)}`;
}

export function formatearPrecio(pesos: number | null | undefined): string {
  if (pesos === null || pesos === undefined) return '—';
  return clp.format(pesos);
}

export const NOMBRE_PASILLO: Record<string, string> = {
  verduleria: 'Verduleria',
  carniceria: 'Carnes y pescados',
  lacteos: 'Lacteos',
  panaderia: 'Panaderia',
  abarrotes: 'Abarrotes',
  congelados: 'Congelados',
  bebidas: 'Bebidas',
  limpieza: 'Limpieza',
  otros: 'Otros',
};

/** El mismo orden del enum `pasillo` en la BD: el orden del local. */
export const ORDEN_PASILLOS = Object.keys(NOMBRE_PASILLO);
