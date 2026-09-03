/// <reference path="../.astro/types.d.ts" />

import type { SupabaseClient, User } from '@supabase/supabase-js';

declare global {
  namespace App {
    interface Locals {
      /** Cliente Supabase con la sesion del request ya montada. */
      supabase: SupabaseClient;
      /** Usuario autenticado, o null. Lo resuelve el middleware. */
      user: User | null;
    }
  }
}
