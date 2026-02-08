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

const isMeetLink = (link?: string | null) => Boolean(link && link.includes('meet.google.com/'))

const extractMeetLink = (payload: any): string | null => {
  if (typeof payload?.hangoutLink === 'string') {
    return payload.hangoutLink
  }
  const entryPoints = payload?.conferenceData?.entryPoints
  if (Array.isArray(entryPoints)) {
    const video = entryPoints.find((entry) => entry?.entryPointType === 'video')
    if (video?.uri) {
      return video.uri
    }
  }
  return null
}

const buildCalendarEventPayload = (patientName: string) => {
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  return {
    summary: `Atendimento - ${patientName}`,
    description: `Link fixo de atendimento para ${patientName}.`,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    transparency: 'transparent',
    visibility: 'private',
    conferenceData: {
      createRequest: {
        requestId: crypto.randomUUID()
      }
    }
  }
}

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
  const clientSecret = getEnv('GOOGLE_CLIENT_SECRET')

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonResponse({ ok: false, error: 'Supabase secrets not configured' }, 500)
  }
  if (!clientId || !clientSecret) {
    return jsonResponse({ ok: false, error: 'Google OAuth not configured' }, 500)
  }

  const patientId = typeof body?.patientId === 'string' ? body.patientId.trim() : ''
  const patientNameFromBody = typeof body?.patientName === 'string' ? body.patientName.trim() : ''

  if (!patientId && !patientNameFromBody) {
    return jsonResponse({ ok: false, error: 'Missing patient info' }, 400)
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  })

  const { data: userData, error: userError } = await authClient.auth.getUser()
  if (userError || !userData?.user) {
    return jsonResponse({ ok: false, error: 'Unauthorized' }, 401)
  }

  const userId = userData.user.id
  const adminClient = createClient(supabaseUrl, serviceKey)

  const { data: tokenRow, error: tokenError } = await adminClient
    .from('google_oauth_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (tokenError || !tokenRow?.refresh_token) {
    return jsonResponse({ ok: false, error: 'GOOGLE_NOT_CONNECTED' }, 409)
  }

  const refreshAccessToken = async () => {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokenRow.refresh_token,
        grant_type: 'refresh_token'
      })
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      console.error('Erro ao atualizar token Google:', data)
      throw new Error('Failed to refresh token')
    }
    const expiresIn = typeof data?.expires_in === 'number' ? data.expires_in : null
    const newExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null
    const accessToken = data?.access_token as string | undefined
    if (!accessToken) {
      throw new Error('Missing access token')
    }
    await adminClient
      .from('google_oauth_tokens')
      .update({
        access_token: accessToken,
        expires_at: newExpiresAt,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
    return accessToken
  }

  const isTokenValid = () => {
    if (!tokenRow.expires_at || !tokenRow.access_token) {
      return false
    }
    const expiresAtMs = new Date(tokenRow.expires_at).getTime()
    if (Number.isNaN(expiresAtMs)) {
      return false
    }
    return expiresAtMs - Date.now() > 60 * 1000
  }

  let accessToken = tokenRow.access_token || ''
  if (!isTokenValid()) {
    try {
      accessToken = await refreshAccessToken()
    } catch (error) {
      return jsonResponse({ ok: false, error: 'Failed to refresh token' }, 500)
    }
  }

  let patientRecord: {
    id: string
    user_id: string
    full_name: string | null
    session_link: string | null
    meet_event_id: string | null
    meet_calendar_id: string | null
  } | null = null

  if (patientId) {
    const { data: patientData, error: patientError } = await adminClient
      .from('patients')
      .select('id, user_id, full_name, session_link, meet_event_id, meet_calendar_id')
      .eq('id', patientId)
      .maybeSingle()

    if (patientError || !patientData || patientData.user_id !== userId) {
      return jsonResponse({ ok: false, error: 'Paciente nÃ£o encontrado' }, 404)
    }

    patientRecord = patientData

    if (isMeetLink(patientRecord.session_link)) {
      return jsonResponse({
        ok: true,
        link: patientRecord.session_link,
        eventId: patientRecord.meet_event_id,
        calendarId: patientRecord.meet_calendar_id
      })
    }
  }

  if (patientRecord?.meet_event_id) {
    try {
      const calendarId = patientRecord.meet_calendar_id || 'primary'
      const eventResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(
          patientRecord.meet_event_id
        )}?conferenceDataVersion=1`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (eventResponse.ok) {
        const eventData = await eventResponse.json().catch(() => ({}))
        const existingLink = extractMeetLink(eventData)
        if (existingLink) {
          await adminClient
            .from('patients')
            .update({ session_link: existingLink })
            .eq('id', patientRecord.id)
          return jsonResponse({
            ok: true,
            link: existingLink,
            eventId: patientRecord.meet_event_id,
            calendarId
          })
        }
      }
    } catch (error) {
      console.error('Erro ao buscar evento Google:', error)
    }
  }

  const patientName = patientRecord?.full_name || patientNameFromBody || 'Paciente'
  const eventPayload = buildCalendarEventPayload(patientName)

  let eventResponse = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(eventPayload)
    }
  )

  if (eventResponse.status === 401) {
    try {
      accessToken = await refreshAccessToken()
      eventResponse = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(eventPayload)
        }
      )
    } catch (error) {
      console.error('Erro ao renovar token e criar evento:', error)
    }
  }

  const eventData = await eventResponse.json().catch(() => ({}))
  if (!eventResponse.ok) {
    console.error('Erro ao criar evento Google:', eventData)
    return jsonResponse({ ok: false, error: 'Failed to create Meet link' }, 500)
  }

  const meetLink = extractMeetLink(eventData)
  if (!meetLink) {
    return jsonResponse({ ok: false, error: 'Meet link not returned' }, 500)
  }

  const eventId = typeof eventData?.id === 'string' ? eventData.id : null
  const calendarId = 'primary'

  if (patientRecord) {
    await adminClient
      .from('patients')
      .update({
        session_link: meetLink,
        meet_event_id: eventId,
        meet_calendar_id: calendarId
      })
      .eq('id', patientRecord.id)
  }

  return jsonResponse({
    ok: true,
    link: meetLink,
    eventId,
    calendarId
  })
})
