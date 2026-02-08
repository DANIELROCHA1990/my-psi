/// <reference path="../deno.d.ts" />
import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

declare const Deno: {
  env: {
    get: (key: string) => string | undefined
  }
}

const getEnv = (key: string) => Deno.env.get(key)?.trim()

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '')

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return atob(`${normalized}${padding}`)
}

const getAppOriginFromState = (state: string) => {
  try {
    const raw = decodeBase64Url(state)
    const parsed = JSON.parse(raw)
    return typeof parsed?.appOrigin === 'string' ? parsed.appOrigin : ''
  } catch {
    return ''
  }
}

const buildRedirect = (baseUrl: string, status: 'connected' | 'error') => {
  const target = `${normalizeBaseUrl(baseUrl)}/settings?tab=integrations&google=${status}`
  return Response.redirect(target, 302)
}

serve(async (req) => {
  const requestUrl = new URL(req.url)
  const errorParam = requestUrl.searchParams.get('error')
  const code = requestUrl.searchParams.get('code') || ''
  const state = requestUrl.searchParams.get('state') || ''

  if (errorParam || !code || !state) {
    return buildRedirect(appUrl, 'error')
  }

  const supabaseUrl = getEnv('SUPABASE_URL') || getEnv('VITE_SUPABASE_URL')
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY') || getEnv('SERVICE_ROLE_KEY')
  const clientId = getEnv('GOOGLE_CLIENT_ID')
  const clientSecret = getEnv('GOOGLE_CLIENT_SECRET')
  const redirectUri = getEnv('GOOGLE_REDIRECT_URI')

  if (!supabaseUrl || !serviceKey) {
    return new Response('Supabase not configured', { status: 500 })
  }
  if (!clientId || !clientSecret || !redirectUri) {
    return new Response('Google OAuth not configured', { status: 500 })
  }

  const adminClient = createClient(supabaseUrl, serviceKey)
  const { data: stateRow, error: stateError } = await adminClient
    .from('google_oauth_states')
    .select('user_id, expires_at')
    .eq('state', state)
    .maybeSingle()

  if (stateError || !stateRow) {
    return new Response('Invalid state', { status: 400 })
  }

  await adminClient.from('google_oauth_states').delete().eq('state', state)

  const candidateUrl = getAppOriginFromState(state)
  const resolvedAppUrl = candidateUrl && /^https?:\/\//i.test(candidateUrl)
    ? candidateUrl
    : ''

  const expiresAt = new Date(stateRow.expires_at).getTime()
  if (Number.isNaN(expiresAt) || expiresAt < Date.now()) {
    if (!resolvedAppUrl) {
      return new Response('Missing app url', { status: 500 })
    }
    return buildRedirect(resolvedAppUrl, 'error')
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  })

  const tokenData = await tokenResponse.json().catch(() => ({}))
  if (!tokenResponse.ok) {
    console.error('Google token error:', tokenData)
    if (!resolvedAppUrl) {
      return new Response('Missing app url', { status: 500 })
    }
    return buildRedirect(resolvedAppUrl, 'error')
  }

  const accessToken = tokenData?.access_token as string | undefined
  const refreshTokenFromGoogle = tokenData?.refresh_token as string | undefined
  const expiresIn = typeof tokenData?.expires_in === 'number' ? tokenData.expires_in : null
  const scope = typeof tokenData?.scope === 'string' ? tokenData.scope : null
  const tokenType = typeof tokenData?.token_type === 'string' ? tokenData.token_type : null

  if (!accessToken) {
    if (!resolvedAppUrl) {
      return new Response('Missing app url', { status: 500 })
    }
    return buildRedirect(resolvedAppUrl, 'error')
  }

  const { data: existingToken } = await adminClient
    .from('google_oauth_tokens')
    .select('refresh_token')
    .eq('user_id', stateRow.user_id)
    .maybeSingle()

  const refreshToken = refreshTokenFromGoogle || existingToken?.refresh_token
  if (!refreshToken) {
    if (!resolvedAppUrl) {
      return new Response('Missing app url', { status: 500 })
    }
    return buildRedirect(resolvedAppUrl, 'error')
  }

  const newExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null

  const { error: tokenUpsertError } = await adminClient
    .from('google_oauth_tokens')
    .upsert(
      {
        user_id: stateRow.user_id,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: tokenType || 'Bearer',
        scope,
        expires_at: newExpiresAt,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'user_id' }
    )

  if (tokenUpsertError) {
    console.error('Erro ao salvar tokens:', tokenUpsertError)
    if (!resolvedAppUrl) {
      return new Response('Missing app url', { status: 500 })
    }
    return buildRedirect(resolvedAppUrl, 'error')
  }

  let email: string | null = null
  try {
    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (profileResponse.ok) {
      const profileData = await profileResponse.json().catch(() => ({}))
      email = typeof profileData?.email === 'string' ? profileData.email : null
    }
  } catch (error) {
    console.error('Erro ao buscar email Google:', error)
  }

  const { error: connectionError } = await adminClient
    .from('google_oauth_connections')
    .upsert(
      {
        user_id: stateRow.user_id,
        email,
        scope,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { onConflict: 'user_id' }
    )

  if (connectionError) {
    console.error('Erro ao salvar conexÃ£o Google:', connectionError)
  }

  if (!resolvedAppUrl) {
    return new Response('Missing app url', { status: 500 })
  }
  return buildRedirect(resolvedAppUrl, 'connected')
})
