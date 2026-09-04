/**
 * Helpers de semana.
 *
 * La semana se identifica por su lunes, guardado como `date` (no timestamptz).
 * Chile cambia de horario dos veces al ano; si guardas el inicio de semana con
 * zona horaria, dos veces al ano la semana empieza el domingo a las 23:00.
 */

export const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] as const;

export const MOMENTOS = ['desayuno', 'almuerzo', 'cena', 'snack'] as const;
export type Momento = (typeof MOMENTOS)[number];

/**
 * 'YYYY-MM-DD' del lunes de la semana que contiene la fecha dada.
 *
 * Sin argumento, "fecha" es el instante actual y su dia civil se lee en hora
 * LOCAL (asi "hoy" es hoy en Chile). Con argumento, se asume ya anclado a
 * medianoche UTC (viene de un `${iso}T00:00:00Z`), asi que su dia civil se lee
 * en UTC. Leer siempre con los getters locales rompia esto: medianoche UTC
 * cae la noche anterior en hora de Chile (UTC-3/-4), asi que un lunes pasado
 * como argumento se leia como domingo y `lunesDe` lo movia una semana atras.
 */
export function lunesDe(fecha?: Date): string {
  const base = fecha
    ? new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()))
    : new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()));
  const dow = base.getUTCDay(); // 0 = domingo
  const offset = dow === 0 ? -6 : 1 - dow;
  base.setUTCDate(base.getUTCDate() + offset);
  return base.toISOString().slice(0, 10);
}

/** Las 7 fechas 'YYYY-MM-DD' de la semana, desde el lunes recibido. */
export function diasDeSemana(inicio: string): string[] {
  const base = new Date(`${inicio}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

export function sumarSemanas(inicio: string, n: number): string {
  const d = new Date(`${inicio}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d.toISOString().slice(0, 10);
}

const fmtCorto = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric', month: 'short', timeZone: 'UTC',
});

export function fechaCorta(iso: string): string {
  return fmtCorto.format(new Date(`${iso}T00:00:00Z`));
}

export function rangoSemana(inicio: string): string {
  const dias = diasDeSemana(inicio);
  return `${fechaCorta(dias[0]!)} al ${fechaCorta(dias[6]!)}`;
}

/** Valida el parametro de ruta /app/semana/[semana] antes de tocar la BD. */
export function esSemanaValida(valor: string | undefined): valor is string {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  return lunesDe(new Date(`${valor}T00:00:00Z`)) === valor;
}
