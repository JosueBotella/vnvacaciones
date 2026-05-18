/**
 * Helpers de respuesta HTTP para Edge Functions.
 * Equivalente a Ok(), BadRequest(), Unauthorized() en un controller de .NET.
 *
 * Uso:
 *   import { ok, error, unauthorized } from '../_shared/response.ts'
 *   return ok({ workers: [...] })
 *   return error('Worker not found', 404)
 */
import { corsHeaders } from './cors.ts'

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }

/** 200 OK con datos */
export const ok = (data: unknown): Response =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: jsonHeaders,
  })

/** 400 Bad Request (o cualquier código de error) */
export const error = (message: string, status = 400): Response =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: jsonHeaders,
  })

/** 401 Unauthorized */
export const unauthorized = (message = 'Unauthorized'): Response =>
  error(message, 401)

/** 404 Not Found */
export const notFound = (message = 'Not found'): Response =>
  error(message, 404)

/** 500 Internal Server Error */
export const serverError = (message = 'Internal server error'): Response =>
  error(message, 500)
