import { useMemo, useState, type SubmitEvent } from 'react';
import { clienteNavegador } from '@/lib/supabase/navegador';
import {
  formatearCantidad,
  formatearFormato,
  NOMBRE_PASILLO,
  ORDEN_PASILLOS,
} from '@/lib/unidades';
import type { ItemLista } from '@/lib/tipos';

type Props = { listaId: string; itemsIniciales: ItemLista[] };

export default function ListaCompras({ listaId, itemsIniciales }: Props) {
  const [items, setItems] = useState<ItemLista[]>(itemsIniciales);
  const [nuevo, setNuevo] = useState('');
  const [copiado, setCopiado] = useState(false);

  // Los checkboxes van directo a Supabase desde el navegador: RLS ya restringe
  // las filas a esta lista, asi que una ruta de API en medio solo agregaria
  // latencia y otro archivo que mantener.
  const supabase = clienteNavegador();

  const grupos = useMemo(() => {
    const porPasillo = new Map<string, ItemLista[]>();
    for (const item of items) {
      // Lo que no se pudo cuantificar se saca de su pasillo y se agrupa al
      // final: no sirve buscarlo en la gondola si no sabes cuanto llevar.
      const clave = item.origen === 'revisar' ? '_revisar' : item.pasillo;
      const grupo = porPasillo.get(clave);
      if (grupo) grupo.push(item);
      else porPasillo.set(clave, [item]);
    }
    const ordenados = ORDEN_PASILLOS.filter((p) => porPasillo.has(p)).map((p) => ({
      clave: p,
      titulo: NOMBRE_PASILLO[p]!,
      items: porPasillo.get(p)!,
    }));
    if (porPasillo.has('_revisar')) {
      ordenados.push({
        clave: '_revisar',
        titulo: 'Revisar antes de salir',
        items: porPasillo.get('_revisar')!,
      });
    }
    return ordenados;
  }, [items]);

  const pendientes = items.filter((i) => !i.marcado).length;

  async function alternar(item: ItemLista) {
    const valor = !item.marcado;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, marcado: valor } : i)));
    const { error } = await supabase
      .from('lista_items')
      .update({ marcado: valor })
      .eq('id', item.id);
    if (error) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, marcado: !valor } : i)));
    }
  }

  async function agregarManual(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const etiqueta = nuevo.trim();
    if (!etiqueta) return;
    setNuevo('');

    const { data, error } = await supabase
      .from('lista_items')
      .insert({
        lista_id: listaId,
        etiqueta,
        pasillo: 'otros',
        origen: 'manual',
        orden: 9999,
      })
      .select('id, etiqueta, pasillo, cantidad_base, base, origen, marcado')
      .single();

    if (error || !data) return;
    setItems((prev) => [...prev, { ...(data as ItemLista), pack_base: null }]);
  }

  /** Texto plano para pegar en WhatsApp. Funciona hoy, sin depender de nadie. */
  async function copiar() {
    const lineas = grupos.flatMap((g) => [
      `*${g.titulo}*`,
      ...g.items
        .filter((i) => !i.marcado)
        .map((i) => {
          const cantidad =
            i.origen === 'revisar' ? 'revisar' : formatearCantidad(i.cantidad_base, i.base);
          return `- ${i.etiqueta} — ${cantidad}`;
        }),
      '',
    ]);
    try {
      await navigator.clipboard.writeText(lineas.join('\n').trim());
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-hueso-300 p-6 text-center text-sm text-hueso-500">
        Esta lista salio vacia. Puede que la despensa cubra toda la semana.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-hueso-200 pb-3">
        <p className="text-sm tabular text-hueso-700">
          <strong>{pendientes}</strong> de {items.length} por comprar
        </p>
        <button
          type="button"
          onClick={() => void copiar()}
          className="ml-auto rounded-md border border-hueso-300 px-3 py-1.5 text-sm font-semibold hover:bg-hueso-100"
        >
          {copiado ? 'Copiada' : 'Copiar para WhatsApp'}
        </button>
      </div>

      <div className="mt-5 space-y-6">
        {grupos.map((grupo) => (
          <section key={grupo.clave}>
            <h2
              className={[
                'font-mono text-xs uppercase tracking-[0.14em]',
                grupo.clave === '_revisar' ? 'text-alerta-500' : 'text-albahaca-600',
              ].join(' ')}
            >
              {grupo.titulo}
            </h2>

            {grupo.clave === '_revisar' && (
              <p className="mt-1.5 max-w-[60ch] text-sm text-hueso-700">
                No pude calcular cuanto comprar: la receta decia &ldquo;a gusto&rdquo;, o al
                ingrediente le falta la densidad o el peso por unidad para convertir la medida.
                Nada se descarta en silencio.
              </p>
            )}

            <ul className="mt-2 divide-y divide-hueso-100 border-t border-hueso-100">
              {grupo.items.map((item) => {
                const formato = formatearFormato(item.cantidad_base, item.pack_base, item.base);
                return (
                  <li key={item.id}>
                    <label className="flex cursor-pointer items-baseline gap-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={item.marcado}
                        onChange={() => void alternar(item)}
                        className="mt-0.5 size-4 shrink-0 accent-albahaca-600"
                      />
                      <span
                        className={[
                          'flex-1 text-sm',
                          item.marcado ? 'text-hueso-300 line-through' : '',
                        ].join(' ')}
                      >
                        {item.etiqueta}
                        {item.origen === 'manual' && (
                          <span className="ml-2 font-mono text-[11px] text-hueso-500">
                            agregado a mano
                          </span>
                        )}
                      </span>
                      <span
                        className={[
                          'shrink-0 text-right font-mono text-[13px] tabular',
                          item.marcado ? 'text-hueso-300' : 'text-hueso-700',
                        ].join(' ')}
                      >
                        {item.origen === 'revisar'
                          ? '—'
                          : formatearCantidad(item.cantidad_base, item.base)}
                        {formato && (
                          <span className="block text-[11px] text-hueso-500">{formato}</span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <form onSubmit={agregarManual} className="mt-6 flex gap-2 border-t border-hueso-200 pt-5">
        <input
          type="text"
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          placeholder="Agregar algo que no sale de una receta…"
          className="min-w-0 flex-1 rounded-lg border border-hueso-300 bg-white px-3 py-2 text-sm outline-none focus:border-albahaca-600"
        />
        <button
          type="submit"
          className="rounded-lg bg-hueso-900 px-4 py-2 text-sm font-semibold text-white hover:bg-hueso-700"
        >
          Agregar
        </button>
      </form>
    </div>
  );
}
