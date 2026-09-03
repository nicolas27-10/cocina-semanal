import { createBrowserClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from 'astro:env/client';

let cliente: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Cliente para usar DENTRO de los islands. Singleton: si creas uno por
 * componente terminas con varios listeners de auth peleando por la sesion.
 *
 * Solo lleva la anon key. Todo lo que protege los datos son las policies
 * de RLS en 0002_rls.sql, no este archivo.
 */
export function clienteNavegador() {
  cliente ??= createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
  return cliente;
}
