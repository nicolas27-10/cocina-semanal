import type { UnidadBase } from '@/lib/unidades';

/**
 * Puente a la tienda, detras de una interfaz.
 *
 * Contexto honesto: no conozco una API publica de Lider que permita a un
 * cliente agregar productos a su carrito desde una app propia. El programa de
 * desarrolladores de Walmart apunta a vendedores de su marketplace, no a esto,
 * y conviene que lo verifiques por tu cuenta antes de contar con ello.
 *
 * Por eso la app no depende de que exista. Solo conoce esta interfaz:
 *
 *   Fase B (hoy)     ProveedorManual  -> el vinculo lo guardas tu en la BD
 *   Fase C (si algun dia se puede)    -> otra implementacion, mismo contrato
 *
 * `agregarAlCarrito` es opcional a proposito: la UI pregunta si existe antes
 * de mostrar el boton, en vez de asumir que si.
 */

export type ProductoTienda = {
  nombre: string;
  url: string | null;
  precioClp: number | null;
  /** Contenido del envase en unidad base: una malla de tomate = 500 (g). */
  contenidoBase: number | null;
  base: UnidadBase | null;
};

export type LineaCarrito = {
  ingredienteId: string;
  cantidadBase: number;
};

export interface ProveedorTienda {
  readonly id: string;
  readonly nombre: string;
  /** Producto vinculado a un ingrediente, si hay alguno guardado. */
  producto(ingredienteId: string): Promise<ProductoTienda | null>;
  /** Solo lo implementa un proveedor que realmente pueda escribir un carrito. */
  agregarAlCarrito?(lineas: LineaCarrito[]): Promise<{ agregados: number }>;
}

type FilaProducto = {
  ingrediente_id: string;
  nombre: string;
  url: string | null;
  precio_clp: number | null;
  contenido_base: number | null;
};

/**
 * Lee los vinculos de `tienda_productos`. Estable porque el dato vive en tu
 * base de datos: nada que se rompa cuando la tienda cambie su HTML.
 */
export class ProveedorManual implements ProveedorTienda {
  readonly id = 'lider';
  readonly nombre = 'Lider (vinculado a mano)';

  constructor(
    private readonly consultar: (ingredienteId: string) => Promise<FilaProducto | null>,
    private readonly baseDe: (ingredienteId: string) => UnidadBase | null,
  ) {}

  async producto(ingredienteId: string): Promise<ProductoTienda | null> {
    const fila = await this.consultar(ingredienteId);
    if (!fila) return null;
    return {
      nombre: fila.nombre,
      url: fila.url,
      precioClp: fila.precio_clp,
      contenidoBase: fila.contenido_base,
      base: this.baseDe(ingredienteId),
    };
  }
  // Sin agregarAlCarrito: este proveedor no puede, y lo dice no implementandolo.
}

/** Total estimado de la compra a partir de los vinculos que tengas cargados. */
export function estimarTotal(
  lineas: { cantidadBase: number | null; producto: ProductoTienda | null }[],
): { totalClp: number; conPrecio: number; sinPrecio: number } {
  let totalClp = 0;
  let conPrecio = 0;
  let sinPrecio = 0;

  for (const { cantidadBase, producto } of lineas) {
    if (!producto?.precioClp || !producto.contenidoBase || cantidadBase === null) {
      sinPrecio += 1;
      continue;
    }
    totalClp += Math.ceil(cantidadBase / producto.contenidoBase) * producto.precioClp;
    conPrecio += 1;
  }

  return { totalClp, conPrecio, sinPrecio };
}
