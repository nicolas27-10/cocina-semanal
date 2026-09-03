import type { APIRoute } from 'astro';
import { lunesDe } from '@/lib/semana';

export const prerender = false;

/** /app siempre lleva a la semana en curso. */
export const GET: APIRoute = ({ redirect }) => redirect(`/app/semana/${lunesDe()}`, 302);
