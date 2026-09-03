import { defineConfig, envField } from 'astro/config';
import netlify from '@astrojs/netlify';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // La app es privada y por usuario: render en el servidor por defecto.
  // Las paginas publicas (landing, login) se marcan con `export const prerender = true`.
  output: 'server',
  adapter: netlify(),
  integrations: [react()],

  // Tailwind v4 se instala como plugin de Vite, NO como integracion de Astro.
  vite: {
    plugins: [tailwindcss()],
  },

  // Variables de entorno tipadas. `context: 'server', access: 'secret'`
  // hace que Astro falle en build si alguna vez importas la key desde un island.
  env: {
    schema: {
      PUBLIC_SUPABASE_URL: envField.string({ context: 'client', access: 'public' }),
      PUBLIC_SUPABASE_ANON_KEY: envField.string({ context: 'client', access: 'public' }),
      ANTHROPIC_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      IA_MODELO: envField.string({
        context: 'server',
        access: 'secret',
        default: 'claude-haiku-4-5',
      }),
    },
  },
});
