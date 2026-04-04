/// <reference path="../deno.d.ts" />
import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { getBearerToken, requireAuth } from '../_shared/auth.ts'

declare const Deno: {
  env: {
    get: (key: string) => string | undefined
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

const getEnv = (key: string) => Deno.env.get(key)?.trim()

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405)
  }

  const body = await req.json().catch(() => ({}))
  const token = getBearerToken(req)
  if (!token) {
    return jsonResponse({ ok: false, error: 'Missing auth token' }, 401)
  }

  const supabaseUrl = getEnv('SUPABASE_URL') || getEnv('VITE_SUPABASE_URL')
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY') || getEnv('SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ ok: false, error: 'Supabase secrets not configured' }, 500)
  }

  const auth = await requireAuth(token).catch(() => null)
  if (!auth?.userId) {
    return jsonResponse({ ok: false, error: 'Unauthorized' }, 401)
  }

  const adminClient = createClient(supabaseUrl, serviceKey)
  const userId = auth.userId

  await adminClient.from('google_oauth_tokens').delete().eq('user_id', userId)
  await adminClient.from('google_oauth_connections').delete().eq('user_id', userId)

  return jsonResponse({ ok: true })
})
