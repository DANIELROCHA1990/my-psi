import { corsHeaders } from './cors.ts'

export const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })

export const errorResponse = (error: string, status = 400, code?: string) =>
  jsonResponse({ ok: false, error, code: code || error }, status)

