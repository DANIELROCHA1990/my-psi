/// <reference path="../deno.d.ts" />
import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { cert, getApps, initializeApp } from 'npm:firebase-admin/app'
import { getMessaging } from 'npm:firebase-admin/messaging'

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

type SessionRow = {
  patient_id: string
  session_date: string
  payment_status: string | null
  session_type?: string | null
  duration_minutes?: number | null
  session_price?: number | null
  patients?: { full_name: string | null }
}

type PushSubscriptionRow = {
  token: string
  patient_id: string
  last_seen_at?: string | null
  updated_at?: string | null
  created_at?: string | null
}

const getOffsetMinutes = (value?: string | null) => {
  const fallback = -180
  if (!value) {
    return fallback
  }
  const trimmed = value.trim()
  const match = trimmed.match(/^([+-])(\d{2}):?(\d{2})$/)
  if (!match) {
    return fallback
  }
  const sign = match[1] === '-' ? -1 : 1
  const hours = Number(match[2])
  const minutes = Number(match[3])
  return sign * (hours * 60 + minutes)
}

const getDateRangeIso = (dateString: string, offsetValue?: string | null) => {
  const offset = offsetValue || '-03:00'
  const start = new Date(`${dateString}T00:00:00${offset}`)
  if (Number.isNaN(start.getTime())) {
    return null
  }
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

const formatTimeWithOffset = (isoString: string, offsetMinutes: number) => {
  const base = new Date(isoString)
  const adjusted = new Date(base.getTime() + offsetMinutes * 60 * 1000)
  return adjusted.toISOString().slice(11, 16)
}

const buildBody = (times: string[]) => {
  const cleaned = Array.from(new Set(times.filter(Boolean))).sort()
  if (!cleaned.length) {
    return 'Sua sessão hoje tem horário a confirmar.'
  }
  if (cleaned.length === 1) {
    return `Sua sessão será hoje às ${cleaned[0]}.`
  }
  const last = cleaned[cleaned.length - 1]
  const initial = cleaned.slice(0, -1)
  return `Suas sessões serão hoje às ${initial.join(', ')} e ${last}.`
}

const initializeFirebase = () => {
  const projectId = Deno.env.get('FIREBASE_PROJECT_ID') ?? ''
  const clientEmail = Deno.env.get('FIREBASE_CLIENT_EMAIL') ?? ''
  const privateKey = (Deno.env.get('FIREBASE_PRIVATE_KEY') ?? '').replace(/\\n/g, '\n')

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase Admin credentials not configured')
  }

  if (!getApps().length) {
    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
      projectId
    })
  }
}

const isInvalidToken = (code?: string) => {
  if (!code) return false
  return (
    code.includes('registration-token-not-registered') ||
    code.includes('invalid-registration-token')
  )
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization') ?? ''
    const body = await req.json().catch(() => ({}))
    const date = typeof body?.date === 'string' ? body.date.trim() : ''
    const bodyToken = typeof body?.accessToken === 'string' ? body.accessToken.trim() : ''
    const token = authHeader
      ? authHeader.replace(/^Bearer\s+/i, '').trim()
      : bodyToken
    const dryRun = Boolean(body?.dryRun)

    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing auth token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid date' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('VITE_SUPABASE_URL') ?? ''
    const anonKey = Deno.env.get('VITE_SUPABASE_ANON_KEY') ?? ''

    if (!supabaseUrl || !anonKey) {
      return new Response(JSON.stringify({ ok: false, error: 'Supabase anon secrets not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    })

    const { data: userData, error: userError } = await authClient.auth.getUser()
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const timezone = Deno.env.get('APP_TIMEZONE') ?? '-03:00'
    const dateRange = getDateRangeIso(date, timezone)
    if (!dateRange) {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid date range' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { startIso, endIso } = dateRange

    const { data: sessions, error: sessionsError } = await authClient
      .from('sessions')
      .select(
        `
        patient_id,
        session_date,
        payment_status,
        session_type,
        duration_minutes,
        session_price,
        patients (
          full_name
        )
      `
      )
      .gte('session_date', startIso)
      .lt('session_date', endIso)
      .neq('payment_status', 'cancelled')
      .order('session_date', { ascending: true })

    if (sessionsError) {
      console.error('Erro ao buscar sessoes:', sessionsError)
      return new Response(JSON.stringify({ ok: false, error: 'Failed to fetch sessions' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const offsetMinutes = getOffsetMinutes(timezone)
    const sessionsByPatient = new Map<string, string[]>()
    const sessionDetailsByPatient = new Map<string, SessionRow[]>()
    const patientNames = new Map<string, string>()

    ;(sessions as SessionRow[] | null)?.forEach((session) => {
      if (!session.patient_id) return
      const timeLabel = formatTimeWithOffset(session.session_date, offsetMinutes)
      const list = sessionsByPatient.get(session.patient_id) ?? []
      list.push(timeLabel)
      sessionsByPatient.set(session.patient_id, list)
      const detailList = sessionDetailsByPatient.get(session.patient_id) ?? []
      detailList.push(session)
      sessionDetailsByPatient.set(session.patient_id, detailList)
      if (!patientNames.has(session.patient_id)) {
        const name = session.patients?.full_name?.trim() || 'Paciente'
        patientNames.set(session.patient_id, name)
      }
    })

    const patientIds = Array.from(sessionsByPatient.keys())
    if (!patientIds.length) {
      return new Response(
        JSON.stringify({ ok: true, patients: 0, sent: 0, inactivePatients: [], dryRun }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: subscriptions, error: subscriptionsError } = await authClient
      .from('push_subscriptions')
      .select('token, patient_id, last_seen_at, updated_at, created_at')
      .eq('is_enabled', true)
      .in('patient_id', patientIds)

    if (subscriptionsError) {
      console.error('Erro ao buscar push_subscriptions:', subscriptionsError)
      return new Response(JSON.stringify({ ok: false, error: 'Failed to fetch subscriptions' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const tokensByPatient = new Map<
      string,
      { token: string; lastSeenAt: string | null; updatedAt: string | null; createdAt: string | null }
    >()
    ;(subscriptions as PushSubscriptionRow[] | null)?.forEach((sub) => {
      const current = tokensByPatient.get(sub.patient_id)
      const candidate = {
        token: sub.token,
        lastSeenAt: sub.last_seen_at ?? null,
        updatedAt: sub.updated_at ?? null,
        createdAt: sub.created_at ?? null
      }
      if (!current) {
        tokensByPatient.set(sub.patient_id, candidate)
        return
      }

      const currentScore = [
        current.lastSeenAt,
        current.updatedAt,
        current.createdAt
      ].find(Boolean)
      const candidateScore = [
        candidate.lastSeenAt,
        candidate.updatedAt,
        candidate.createdAt
      ].find(Boolean)

      if (!currentScore && candidateScore) {
        tokensByPatient.set(sub.patient_id, candidate)
        return
      }
      if (currentScore && candidateScore && candidateScore > currentScore) {
        tokensByPatient.set(sub.patient_id, candidate)
      }
    })

    const patientsWithTokens = patientIds.filter((id) => tokensByPatient.has(id))
    const inactivePatients = patientIds
      .filter((id) => !patientsWithTokens.includes(id))
      .map((id) => patientNames.get(id) || 'Paciente')
      .sort((a, b) => a.localeCompare(b))

    if (!patientsWithTokens.length) {
      return new Response(
        JSON.stringify({
          ok: true,
          patients: patientIds.length,
          sent: 0,
          inactivePatients,
          dryRun
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (dryRun) {
      return new Response(
        JSON.stringify({
          ok: true,
          patients: patientIds.length,
          sent: 0,
          inactivePatients,
          dryRun
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    initializeFirebase()
    const messaging = getMessaging()

    let sent = 0
    let failed = 0
    const logRows: Array<Record<string, unknown>> = []
    const invalidTokens: string[] = []

    for (const patientId of patientsWithTokens) {
      const tokenEntry = tokensByPatient.get(patientId)
      if (!tokenEntry) {
        continue
      }
      const tokens = [tokenEntry.token]
      const times = sessionsByPatient.get(patientId) ?? []
      const bodyMessage = buildBody(times)
      const sessionDetails = sessionDetailsByPatient.get(patientId) ?? []
      const sortedSessions = [...sessionDetails].sort((a, b) => {
        return new Date(a.session_date).getTime() - new Date(b.session_date).getTime()
      })
      const primarySession = sortedSessions[0]
      const primaryTime = primarySession
        ? formatTimeWithOffset(primarySession.session_date, offsetMinutes)
        : times[0] ?? ''
      const status = primarySession?.payment_status || 'pending'
      const sessionType = primarySession?.session_type || ''
      const durationMinutes = primarySession?.duration_minutes ?? 50
      const priceValue =
        primarySession?.session_price !== null && primarySession?.session_price !== undefined
          ? String(primarySession.session_price)
          : ''
      const patientName = patientNames.get(patientId) || 'Paciente'

      const route = new URL(`/push/agenda`, 'https://example.org')
      route.searchParams.set('date', date)
      if (primaryTime) route.searchParams.set('time', primaryTime)
      if (durationMinutes) route.searchParams.set('duration', String(durationMinutes))
      if (status) route.searchParams.set('status', status)
      if (sessionType) route.searchParams.set('type', sessionType)
      if (priceValue) route.searchParams.set('price', priceValue)
      if (patientName) route.searchParams.set('patient', patientName)

      const dataPayload = {
        route: route.pathname + route.search,
        title: 'Lembrete de sessão',
        body: bodyMessage,
        date,
        time: primaryTime,
        times: Array.from(new Set(times)).join(', '),
        patient_id: patientId,
        patient_name: patientName,
        status,
        session_type: sessionType,
        duration_minutes: String(durationMinutes),
        session_price: priceValue
      }

      const message = {
        tokens,
        data: Object.fromEntries(
          Object.entries(dataPayload).map(([key, value]) => [key, String(value ?? '')])
        )
      }

      const response = await messaging.sendEachForMulticast(message)

      response.responses.forEach((entry, index) => {
        const token = tokens[index]
        if (entry.success) {
          sent += 1
          logRows.push({
            date,
            patient_id: patientId,
            token,
            status: 'sent',
            error: null,
            payload: { data: message.data }
          })
          return
        }

        failed += 1
        const errorMessage = entry.error?.message || 'Erro desconhecido'
        const errorCode = entry.error?.code
        if (isInvalidToken(errorCode)) {
          invalidTokens.push(token)
        }
        logRows.push({
          date,
          patient_id: patientId,
          token,
          status: 'failed',
          error: errorMessage,
          payload: { data: message.data }
        })
      })
    }

    if (invalidTokens.length) {
      const { data: disabledRows, error: disableError } = await authClient
        .from('push_subscriptions')
        .update({
          is_enabled: false,
          meta: {
            disabled_reason: 'invalid_token',
            updated_at: new Date().toISOString()
          }
        })
        .in('token', invalidTokens)
        .select('token')

      if (disableError) {
        console.error('Erro ao desativar tokens:', disableError)
      }
    }

    if (logRows.length) {
      const { error: logError } = await authClient.from('push_notifications_log').insert(logRows)
      if (logError) {
        console.error('Erro ao salvar logs de push:', logError)
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        patients: patientIds.length,
        sent,
        inactivePatients,
        dryRun
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Erro ao enviar push:', error)
    return new Response(JSON.stringify({ ok: false, error: 'Failed to send push' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})


