/**
 * Cabeceras CORS estándar para todas las Edge Functions.
 *
 * CORS (Cross-Origin Resource Sharing) es el mecanismo que controla
 * desde qué dominios el navegador permite hacer llamadas a la API.
 * Sin estas cabeceras, el navegador bloquea las peticiones.
 *
 * Uso:
 *   import { corsHeaders } from '../_shared/cors.ts'
 *   if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}
