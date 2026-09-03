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

/** 'YYYY-MM-DD' del lunes de la semana que contiene la fecha dada. */
export function lunesDe(fecha: Date = new Date()): string {
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const dow = d.getUTCDay(); // 0 = domingo
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
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
