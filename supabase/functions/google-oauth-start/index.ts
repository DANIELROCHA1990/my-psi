/// <reference path="../deno.d.ts" />
import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

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

const encodeBase64Url = (value: string) =>
  btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization') ?? ''
  const body = await req.json().catch(() => ({}))
  const bodyToken = typeof body?.accessToken === 'string' ? body.accessToken.trim() : ''
  const appOrigin = typeof body?.appOrigin === 'string' ? body.appOrigin.trim() : ''
  const isLocalOrigin = /localhost|127\.0\.0\.1/i.test(appOrigin)
  const useLocalCallback = typeof body?.useLocalCallback === 'boolean'
    ? body.useLocalCallback
    : isLocalOrigin
  const token = authHeader
    ? authHeader.replace(/^Bearer\s+/i, '').trim()
    : bodyToken
  if (!token) {
    return jsonResponse({ ok: false, error: 'Missing auth token' }, 401)
  }

  const supabaseUrl = getEnv('SUPABASE_URL') || getEnv('VITE_SUPABASE_URL')
  const anonKey = getEnv('SUPABASE_ANON_KEY') || getEnv('VITE_SUPABASE_ANON_KEY')
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY') || getEnv('SERVICE_ROLE_KEY')
  const clientId = getEnv('GOOGLE_CLIENT_ID')
  const redirectUriProd = getEnv('GOOGLE_REDIRECT_URI')
  const redirectUriLocal = getEnv('GOOGLE_REDIRECT_URI_LOCAL')

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonResponse({ ok: false, error: 'Supabase secrets not configured' }, 500)
  }

  const redirectUri = useLocalCallback ? (redirectUriLocal || redirectUriProd) : redirectUriProd
  const appUrl = appOrigin

  if (!clientId || !redirectUri) {
    return jsonResponse({ ok: false, error: 'Google OAuth not configured' }, 500)
  }
  if (!appUrl || !/^https?:\/\//i.test(appUrl)) {
    return jsonResponse({ ok: false, error: 'Missing app origin' }, 400)
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  })

  const { data: userData, error: userError } = await authClient.auth.getUser()
  if (userError || !userData?.user) {
    return jsonResponse({ ok: false, error: 'Unauthorized' }, 401)
  }

  const statePayload = {
    nonce: crypto.randomUUID().replace(/-/g, ''),
    appOrigin: appUrl
  }
  const state = encodeBase64Url(JSON.stringify(statePayload))
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  const adminClient = createClient(supabaseUrl, serviceKey)
  const { error: insertError } = await adminClient
    .from('google_oauth_states')
    .insert({ state, user_id: userData.user.id, expires_at: expiresAt })

  if (insertError) {
    console.error('Erro ao salvar state:', insertError)
    return jsonResponse({ ok: false, error: 'Failed to start OAuth' }, 500)
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    scope: 'https://www.googleapis.com/auth/calendar.events'
  })
  params.set('state', state)

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  return jsonResponse({ ok: true, url })
})
