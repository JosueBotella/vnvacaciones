/**
 * Helper de autenticación para Edge Functions.
 * Equivalente al atributo [Authorize] + inyección del DbContext en .NET.
 *
 * Extrae el token del header Authorization de la petición entrante
 * y devuelve un cliente Supabase autenticado con ese token.
 * Si no hay token, lanza un error que debe capturarse en la función.
 *
 * Uso:
 *   import { getAuthenticatedClient } from '../_shared/auth.ts'
 *
 *   const supabase = getAuthenticatedClient(req)
 *   const { data, error } = await supabase.from('workers').select('*')
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const getAuthenticatedClient = (req: Request) => {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    throw new Error('Missing Authorization header')
  }

  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    {
      global: {
        headers: { Authorization: authHeader },
      },
    }
  )
}

/**
 * Cliente de servicio sin autenticación de usuario.
 * Usar solo en operaciones internas que no dependen del contexto del usuario
 * (crons, webhooks, operaciones de sistema).
 * Equivalente a un DbContext con permisos de administrador en .NET.
 */
export const getServiceClient = () =>
  createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )
