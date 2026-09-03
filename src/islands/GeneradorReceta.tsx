import { useState, type SubmitEvent } from 'react';

type IngredienteIA = { slug: string; cantidad: number; unidad: string; nota?: string };
type RecetaIA = {
  titulo: string;
  resumen: string;
  porciones: number;
  min_prep: number;
  min_coccion: number;
  etiquetas: string[];
  pasos: string[];
  ingredientes: IngredienteIA[];
};
type Respuesta = { criterio: string; recetas: RecetaIA[]; desconocidos: string[] };

const EJEMPLOS = [
  'algo rapido con lo que sobro del asado',
  'cuatro cenas de olla para una semana fria',
  'almuerzos vegetarianos que no sean ensalada',
];

export default function GeneradorReceta() {
  const [abierto, setAbierto] = useState(false);
  const [pedido, setPedido] = useState('');
  const [porciones, setPorciones] = useState(4);
  const [cantidad, setCantidad] = useState(1);
  const [reusar, setReusar] = useState(true);
  const [usarDespensa, setUsarDespensa] = useState(true);

  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Respuesta | null>(null);

  async function generar(e?: SubmitEvent<HTMLFormElement>) {
    e?.preventDefault();
    setCargando(true);
    setError(null);
    setResultado(null);

    const res = await fetch('/api/recetas/generar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pedido,
        porciones,
        cantidad,
        reusar_ingredientes: reusar,
        usar_despensa: usarDespensa,
      }),
    });
    setCargando(false);

    if (!res.ok) {
      const cuerpo = (await res.json().catch(() => ({}))) as {
        error?: string;
        errores?: Record<string, string>;
      };
      setError(cuerpo.error ?? Object.values(cuerpo.errores ?? {})[0] ?? 'Algo fallo.');
      return;
    }
    setResultado((await res.json()) as Respuesta);
  }

  async function guardar() {
    if (!resultado) return;
    setGuardando(true);
    setError(null);

    const res = await fetch('/api/recetas', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ recetas: resultado.recetas }),
    });
    setGuardando(false);

    if (!res.ok) {
      const cuerpo = (await res.json().catch(() => ({}))) as { error?: string; slugs?: string[] };
      setError(
        cuerpo.slugs?.length
          ? `Ingredientes fuera del catalogo: ${cuerpo.slugs.join(', ')}`
          : (cuerpo.error ?? 'No se pudieron guardar.'),
      );
      return;
    }
    window.location.reload();
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-lg bg-albahaca-600 px-5 py-2.5 font-semibold text-white transition-colors hover:bg-albahaca-700"
      >
        Generar recetas
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-hueso-200 bg-white p-5">
      <form onSubmit={generar}>
        <label className="block">
          <span className="text-sm font-semibold">Que quieres cocinar</span>
          <textarea
            value={pedido}
            onChange={(e) => setPedido(e.target.value)}
            required
            minLength={3}
            maxLength={500}
            rows={2}
            placeholder={EJEMPLOS[0]}
            className="mt-1.5 w-full resize-y rounded-lg border border-hueso-300 px-3 py-2 outline-none focus:border-albahaca-600"
          />
        </label>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {EJEMPLOS.map((ej) => (
            <button
              key={ej}
              type="button"
              onClick={() => setPedido(ej)}
              className="rounded-full border border-hueso-200 px-2.5 py-1 text-[12px] text-hueso-700 hover:border-albahaca-200 hover:bg-albahaca-50"
            >
              {ej}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-5">
          <label className="block">
            <span className="text-sm font-semibold">Porciones</span>
            <input
              type="number"
              min={1}
              max={12}
              value={porciones}
              onChange={(e) => setPorciones(Number(e.target.value))}
              className="mt-1.5 w-20 rounded-lg border border-hueso-300 px-3 py-1.5 text-center tabular outline-none focus:border-albahaca-600"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold">Recetas</span>
            <input
              type="number"
              min={1}
              max={7}
              value={cantidad}
              onChange={(e) => setCantidad(Number(e.target.value))}
              className="mt-1.5 w-20 rounded-lg border border-hueso-300 px-3 py-1.5 text-center tabular outline-none focus:border-albahaca-600"
            />
          </label>
        </div>

        <div className="mt-4 space-y-2 border-t border-hueso-100 pt-4">
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={reusar}
              onChange={(e) => setReusar(e.target.checked)}
              disabled={cantidad < 2}
              className="mt-0.5 accent-albahaca-600"
            />
            <span className={cantidad < 2 ? 'text-hueso-300' : 'text-hueso-700'}>
              <strong className="font-semibold">Compartir ingredientes entre platos.</strong> Los
              platos se piensan como conjunto para que la compra sea corta y no sobren perecibles a
              medio usar. {cantidad < 2 && '(Aplica desde 2 recetas.)'}
            </span>
          </label>
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={usarDespensa}
              onChange={(e) => setUsarDespensa(e.target.checked)}
              className="mt-0.5 accent-albahaca-600"
            />
            <span className="text-hueso-700">
              <strong className="font-semibold">Partir de la despensa.</strong> Prioriza lo que ya
              tienes en casa.
            </span>
          </label>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="submit"
            disabled={cargando}
            className="rounded-lg bg-albahaca-600 px-5 py-2.5 font-semibold text-white transition-colors hover:bg-albahaca-700 disabled:bg-hueso-300"
          >
            {cargando ? 'Pensando…' : cantidad > 1 ? `Generar ${cantidad} recetas` : 'Generar'}
          </button>
          <button
            type="button"
            onClick={() => setAbierto(false)}
            className="text-sm text-hueso-500 hover:text-hueso-900"
          >
            Cancelar
          </button>
        </div>
      </form>

      {error && (
        <p className="mt-4 rounded-lg border border-ladrillo-500/30 bg-ladrillo-50 px-4 py-2.5 text-sm text-ladrillo-500">
          {error}
        </p>
      )}

      {cargando && (
        <div className="mt-5 space-y-2" aria-live="polite">
          <div className="h-4 w-2/5 rounded bg-hueso-100" />
          <div className="h-3 w-4/5 rounded bg-hueso-100" />
          <div className="h-3 w-3/5 rounded bg-hueso-100" />
        </div>
      )}

      {resultado && (
        <div className="mt-6 border-t border-hueso-200 pt-5">
          <p className="max-w-[62ch] text-sm italic text-hueso-700">{resultado.criterio}</p>

          {resultado.desconocidos.length > 0 && (
            <p className="mt-3 rounded-lg border border-alerta-500/30 bg-alerta-50 px-4 py-2.5 text-sm text-hueso-700">
              El modelo nombro cosas que no estan en tu catalogo:{' '}
              <span className="font-mono">{resultado.desconocidos.join(', ')}</span>. Agregalas
              como ingredientes primero, o vuelve a generar.
            </p>
          )}

          <ul className="mt-4 space-y-3">
            {resultado.recetas.map((receta, i) => (
              <li key={i} className="rounded-lg border border-hueso-200 p-4">
                <h3 className="font-semibold">{receta.titulo}</h3>
                <p className="mt-1 text-sm text-hueso-700">{receta.resumen}</p>
                <p className="mt-2 font-mono text-[11px] text-hueso-500">
                  {receta.porciones} porc. · {receta.min_prep + receta.min_coccion} min ·{' '}
                  {receta.ingredientes.length} ingredientes · {receta.pasos.length} pasos
                </p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-semibold text-albahaca-600">
                    Ver ingredientes
                  </summary>
                  <ul className="mt-2 space-y-0.5 font-mono text-[12px] text-hueso-700">
                    {receta.ingredientes.map((ing) => (
                      <li key={ing.slug}>
                        <span className="tabular">
                          {ing.cantidad} {ing.unidad}
                        </span>{' '}
                        {ing.slug}
                        {ing.nota && <span className="text-hueso-500"> · {ing.nota}</span>}
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void guardar()}
              disabled={guardando || resultado.desconocidos.length > 0}
              className="rounded-lg bg-albahaca-600 px-5 py-2.5 font-semibold text-white hover:bg-albahaca-700 disabled:bg-hueso-300"
            >
              {guardando
                ? 'Guardando…'
                : `Guardar ${resultado.recetas.length === 1 ? 'la receta' : `las ${resultado.recetas.length}`}`}
            </button>
            <button
              type="button"
              onClick={() => void generar()}
              className="text-sm text-hueso-500 hover:text-hueso-900"
            >
              Generar otra vez
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
