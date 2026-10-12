/// <reference path="../deno.d.ts" />
import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { getAdminClient } from '../_shared/supabase.ts'

serve(async (request: Request) => {
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const { error } = await getAdminClient().from('profiles').select('id').limit(1)
    if (error) {
      throw error
    }

    return new Response('ok', { status: 200 })
  } catch (error) {
    console.error('keep_alive_query_failed', error instanceof Error ? error.message : 'unknown_error')
    return new Response('Keep-alive query failed', { status: 500 })
  }
})