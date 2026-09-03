import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { MOMENTOS, type Momento, fechaCorta, DIAS } from '@/lib/semana';
import type { EntradaPlan, RecetaResumen } from '@/lib/tipos';

type Props = {
  planId: string;
  dias: string[];
  entradasIniciales: EntradaPlan[];
  recetas: RecetaResumen[];
  listaExistente: string | null;
};

const clave = (dia: string, momento: Momento) => `${dia}|${momento}`;

const ETIQUETA_MOMENTO: Record<Momento, string> = {
  desayuno: 'Desayuno',
  almuerzo: 'Almuerzo',
  cena: 'Cena',
  snack: 'Snack',
};

export default function PlanificadorSemana({
  planId,
  dias,
  entradasIniciales,
  recetas,
  listaExistente,
}: Props) {
  const [entradas, setEntradas] = useState<EntradaPlan[]>(entradasIniciales);
  const [busqueda, setBusqueda] = useState('');
  const [todosLosMomentos, setTodosLosMomentos] = useState(false);
  const [seleccionada, setSeleccionada] = useState<RecetaResumen | null>(null);
  const [arrastrando, setArrastrando] = useState<RecetaResumen | null>(null);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensores = useSensors(
    // 6px de tolerancia: sin esto, un click en la receta cuenta como arrastre
    // y el modo "click para asignar" nunca se dispara.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const momentos: Momento[] = todosLosMomentos ? [...MOMENTOS] : ['almuerzo', 'cena'];

  const porCasilla = useMemo(
    () => new Map(entradas.map((e) => [clave(e.dia, e.momento), e])),
    [entradas],
  );

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return recetas;
    return recetas.filter(
      (r) =>
        r.titulo.toLowerCase().includes(q) ||
        r.etiquetas.some((t) => t.toLowerCase().includes(q)),
    );
  }, [recetas, busqueda]);

  const usadas = new Set(entradas.map((e) => e.receta_id).filter(Boolean));

  async function asignar(dia: string, momento: Momento, receta: RecetaResumen) {
    setError(null);
    const previas = entradas;
    // Optimista: la casilla se pinta antes de que responda el servidor y se
    // revierte si falla. En una grilla de 21 casillas la latencia se nota.
    const provisoria: EntradaPlan = {
      id: `tmp-${clave(dia, momento)}`,
      dia,
      momento,
      receta_id: receta.id,
      texto_libre: null,
      porciones_override: null,
      titulo: receta.titulo,
    };
    setEntradas((prev) => [
      ...prev.filter((e) => !(e.dia === dia && e.momento === momento)),
      provisoria,
    ]);

    const res = await fetch('/api/menu/entrada', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plan_id: planId, dia, momento, receta_id: receta.id }),
    });

    if (!res.ok) {
      setEntradas(previas);
      setError('No se pudo guardar esa comida. Intenta de nuevo.');
      return;
    }
    const { id } = (await res.json()) as { id: string };
    setEntradas((prev) => prev.map((e) => (e.id === provisoria.id ? { ...e, id } : e)));
  }

  async function quitar(entrada: EntradaPlan) {
    setError(null);
    const previas = entradas;
    setEntradas((prev) => prev.filter((e) => e.id !== entrada.id));

    const res = await fetch(`/api/menu/entrada?id=${encodeURIComponent(entrada.id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      setEntradas(previas);
      setError('No se pudo vaciar la casilla.');
    }
  }

  async function cambiarPorciones(entrada: EntradaPlan, valor: number | null) {
    setEntradas((prev) =>
      prev.map((e) => (e.id === entrada.id ? { ...e, porciones_override: valor } : e)),
    );
    await fetch('/api/menu/entrada', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        plan_id: planId,
        dia: entrada.dia,
        momento: entrada.momento,
        receta_id: entrada.receta_id,
        porciones_override: valor,
      }),
    });
  }

  async function generarLista() {
    setGenerando(true);
    setError(null);
    const res = await fetch('/api/lista/generar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plan_id: planId }),
    });
    setGenerando(false);

    if (!res.ok) {
      const cuerpo = (await res.json().catch(() => ({}))) as { error?: string };
      setError(cuerpo.error ?? 'No se pudo generar la lista.');
      return;
    }
    const { lista_id } = (await res.json()) as { lista_id: string };
    window.location.href = `/app/lista/${lista_id}`;
  }

  function onDragStart(evento: DragStartEvent) {
    const receta = recetas.find((r) => r.id === evento.active.id);
    setArrastrando(receta ?? null);
  }

  function onDragEnd(evento: DragEndEvent) {
    setArrastrando(null);
    if (!evento.over) return;
    const receta = recetas.find((r) => r.id === evento.active.id);
    if (!receta) return;
    const [dia, momento] = String(evento.over.id).split('|');
    if (dia && momento) void asignar(dia, momento as Momento, receta);
  }

  const comidasPuestas = entradas.filter((e) => e.receta_id).length;

  return (
    <DndContext sensors={sensores} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px]">
        {/* ---------- grilla de la semana ---------- */}
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-hueso-700">
              <input
                type="checkbox"
                checked={todosLosMomentos}
                onChange={(e) => setTodosLosMomentos(e.target.checked)}
                className="accent-albahaca-600"
              />
              Mostrar desayuno y snack
            </label>
            {seleccionada && (
              <p className="rounded-md bg-albahaca-50 px-3 py-1 text-sm text-albahaca-700">
                <strong>{seleccionada.titulo}</strong> seleccionada — toca una casilla
                <button
                  type="button"
                  onClick={() => setSeleccionada(null)}
                  className="ml-2 underline"
                >
                  cancelar
                </button>
              </p>
            )}
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-[80px_repeat(7,minmax(0,1fr))] gap-1.5">
                <div />
                {dias.map((dia, i) => (
                  <div key={dia} className="pb-1 text-center">
                    <p className="text-xs font-semibold capitalize">{DIAS[i]}</p>
                    <p className="font-mono text-[11px] text-hueso-500">{fechaCorta(dia)}</p>
                  </div>
                ))}

                {momentos.map((momento) => (
                  <div key={momento} className="contents">
                    <div className="flex items-center justify-end pr-1 text-xs font-semibold text-hueso-500">
                      {ETIQUETA_MOMENTO[momento]}
                    </div>
                    {dias.map((dia) => (
                      <Casilla
                        key={clave(dia, momento)}
                        dia={dia}
                        momento={momento}
                        entrada={porCasilla.get(clave(dia, momento))}
                        seleccionada={seleccionada}
                        onColocar={(receta) => {
                          void asignar(dia, momento, receta);
                          setSeleccionada(null);
                        }}
                        onQuitar={quitar}
                        onPorciones={cambiarPorciones}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <p className="mt-3 rounded-lg border border-ladrillo-500/30 bg-ladrillo-50 px-4 py-2.5 text-sm text-ladrillo-500">
              {error}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-hueso-200 pt-5">
            <button
              type="button"
              onClick={() => void generarLista()}
              disabled={generando || comidasPuestas === 0}
              className="rounded-lg bg-albahaca-600 px-5 py-2.5 font-semibold text-white transition-colors hover:bg-albahaca-700 disabled:cursor-not-allowed disabled:bg-hueso-300"
            >
              {generando ? 'Calculando…' : 'Generar lista de compras'}
            </button>
            <p className="text-sm text-hueso-500">
              {comidasPuestas === 0
                ? 'Agrega al menos una comida.'
                : `${comidasPuestas} ${comidasPuestas === 1 ? 'comida' : 'comidas'} en la semana.`}
            </p>
            {listaExistente && (
              <a
                href={`/app/lista/${listaExistente}`}
                className="ml-auto text-sm font-semibold text-albahaca-600 hover:underline"
              >
                Ver ultima lista &rarr;
              </a>
            )}
          </div>
        </div>

        {/* ---------- recetas ---------- */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <h2 className="text-sm font-semibold">Tus recetas</h2>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar…"
            className="mt-2 w-full rounded-lg border border-hueso-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-albahaca-600"
          />

          {recetas.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-hueso-300 p-3 text-sm text-hueso-500">
              Todavia no tienes recetas.{' '}
              <a href="/app/recetas" className="font-semibold text-albahaca-600 underline">
                Genera las primeras
              </a>
              .
            </p>
          ) : (
            <ul className="mt-2 max-h-[60vh] space-y-1.5 overflow-y-auto pr-1">
              {filtradas.map((receta) => (
                <li key={receta.id}>
                  <ChipReceta
                    receta={receta}
                    usada={usadas.has(receta.id)}
                    seleccionada={seleccionada?.id === receta.id}
                    onSeleccionar={() =>
                      setSeleccionada((prev) => (prev?.id === receta.id ? null : receta))
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      <DragOverlay>
        {arrastrando && (
          <div className="rounded-lg border border-albahaca-500 bg-white px-3 py-2 text-sm font-semibold shadow-lg">
            {arrastrando.titulo}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

/* ------------------------------------------------------------------ */

function ChipReceta({
  receta,
  usada,
  seleccionada,
  onSeleccionar,
}: {
  receta: RecetaResumen;
  usada: boolean;
  seleccionada: boolean;
  onSeleccionar: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: receta.id });
  const minutos = (receta.min_prep ?? 0) + (receta.min_coccion ?? 0);

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onSeleccionar}
      {...listeners}
      {...attributes}
      aria-pressed={seleccionada}
      className={[
        'w-full cursor-grab rounded-lg border bg-white px-3 py-2 text-left transition-colors',
        isDragging ? 'opacity-40' : '',
        seleccionada
          ? 'border-albahaca-500 ring-2 ring-albahaca-200'
          : 'border-hueso-200 hover:border-hueso-300',
      ].join(' ')}
    >
      <span className="block text-sm font-semibold leading-snug">{receta.titulo}</span>
      <span className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-hueso-500">
        {minutos > 0 && <span>{minutos} min</span>}
        <span>{receta.porciones} porc.</span>
        {usada && <span className="text-albahaca-600">· en la semana</span>}
      </span>
    </button>
  );
}

function Casilla({
  dia,
  momento,
  entrada,
  seleccionada,
  onColocar,
  onQuitar,
  onPorciones,
}: {
  dia: string;
  momento: Momento;
  entrada: EntradaPlan | undefined;
  seleccionada: RecetaResumen | null;
  onColocar: (receta: RecetaResumen) => void;
  onQuitar: (entrada: EntradaPlan) => void;
  onPorciones: (entrada: EntradaPlan, valor: number | null) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: clave(dia, momento) });

  if (entrada) {
    return (
      <div
        ref={setNodeRef}
        className={[
          'group relative min-h-[72px] rounded-lg border bg-white p-2',
          isOver ? 'border-albahaca-500 ring-2 ring-albahaca-200' : 'border-hueso-200',
        ].join(' ')}
      >
        <p className="pr-4 text-[13px] font-semibold leading-tight">
          {entrada.titulo ?? entrada.texto_libre}
        </p>
        <button
          type="button"
          onClick={() => onQuitar(entrada)}
          aria-label={`Quitar ${entrada.titulo ?? 'comida'}`}
          className="absolute right-1 top-1 rounded px-1 text-hueso-300 opacity-0 transition-opacity hover:text-ladrillo-500 focus-visible:opacity-100 group-hover:opacity-100"
        >
          &times;
        </button>
        {entrada.receta_id && (
          <label className="mt-1.5 flex items-center gap-1 font-mono text-[11px] text-hueso-500">
            <input
              type="number"
              min={1}
              max={20}
              value={entrada.porciones_override ?? ''}
              placeholder="porc."
              onChange={(e) =>
                onPorciones(entrada, e.target.value ? Number(e.target.value) : null)
              }
              className="w-12 rounded border border-hueso-200 px-1 py-0.5 text-center tabular"
            />
            porc.
          </label>
        )}
      </div>
    );
  }

  return (
    <button
      ref={setNodeRef}
      type="button"
      disabled={!seleccionada}
      onClick={() => seleccionada && onColocar(seleccionada)}
      aria-label={`Casilla vacia, ${momento}`}
      className={[
        'min-h-[72px] rounded-lg border border-dashed transition-colors',
        isOver
          ? 'border-albahaca-500 bg-albahaca-50'
          : seleccionada
            ? 'border-albahaca-200 bg-albahaca-50/40 hover:bg-albahaca-50'
            : 'border-hueso-200 bg-white/40',
      ].join(' ')}
    />
  );
}
