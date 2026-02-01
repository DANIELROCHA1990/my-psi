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

const DEFAULT_SESSION_DURATION_MINUTES = 50
const SESSION_BUFFER_MINUTES = 1

const getEnv = (key: string) => Deno.env.get(key)?.trim()

const getDateRangeIso = (dateString: string, offsetValue?: string | null) => {
  const offset = offsetValue || '-03:00'
  const start = new Date(`${dateString}T00:00:00${offset}`)
  if (Number.isNaN(start.getTime())) {
    return null
  }
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

type SessionRow = {
  id: string
  session_date: string
  duration_minutes: number | null
  payment_status: string | null
}

const findConflict = (sessions: SessionRow[], candidateStart: Date) => {
  const candidateEnd = new Date(candidateStart.getTime() + DEFAULT_SESSION_DURATION_MINUTES * 60 * 1000)
  return sessions.find((session) => {
    if (session.payment_status === 'cancelled') {
      return false
    }
    const start = new Date(session.session_date)
    const duration = session.duration_minutes ?? DEFAULT_SESSION_DURATION_MINUTES
    const end = new Date(start.getTime() + duration * 60 * 1000)
    const bufferedEnd = new Date(end.getTime() + SESSION_BUFFER_MINUTES * 60 * 1000)
    return candidateStart < bufferedEnd && candidateEnd > start
  })
}

const buildError = (message: string, status = 400) =>
  new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return buildError('Method not allowed', 405)
  }

  const body = await req.json().catch(() => ({}))
  const action = typeof body?.action === 'string' ? body.action.trim() : ''
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  const timezone = typeof body?.timezone === 'string' ? body.timezone.trim() : ''

  if (!action) {
    return buildError('Missing action')
  }

  if (!token) {
    return buildError('Missing token')
  }

  const supabaseUrl = getEnv('SUPABASE_URL') || getEnv('VITE_SUPABASE_URL')
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY') || getEnv('SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceKey) {
    return buildError('Supabase secrets not configured', 500)
  }

  const adminClient = createClient(supabaseUrl, serviceKey)

  const { data: link, error: linkError } = await adminClient
    .from('public_schedule_links')
    .select('user_id, revoked_at')
    .eq('token', token)
    .maybeSingle()

  if (linkError) {
    console.error('Erro ao buscar link:', linkError)
    return buildError('Failed to validate link', 500)
  }

  if (!link || link.revoked_at) {
    return buildError('Link invalido ou expirado', 404)
  }

  if (action === 'availability') {
    const date = typeof body?.date === 'string' ? body.date.trim() : ''
    if (!/^(\d{4})-(\d{2})-(\d{2})$/.test(date)) {
      return buildError('Invalid date')
    }

    const dateRange = getDateRangeIso(date, timezone || getEnv('APP_TIMEZONE'))
    if (!dateRange) {
      return buildError('Invalid date range')
    }

    const { startIso, endIso } = dateRange

    const { data: sessions, error: sessionsError } = await adminClient
      .from('sessions')
      .select('id, session_date, duration_minutes, payment_status')
      .eq('user_id', link.user_id)
      .gte('session_date', startIso)
      .lt('session_date', endIso)
      .neq('payment_status', 'cancelled')
      .order('session_date', { ascending: true })

    if (sessionsError) {
      console.error('Erro ao buscar sessoes:', sessionsError)
      return buildError('Failed to fetch sessions', 500)
    }

    return new Response(JSON.stringify({ ok: true, sessions: sessions || [] }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  if (action === 'book') {
    const date = typeof body?.date === 'string' ? body.date.trim() : ''
    const time = typeof body?.time === 'string' ? body.time.trim() : ''
    const patient = body?.patient && typeof body.patient === 'object' ? body.patient : null

    if (!/^(\d{4})-(\d{2})-(\d{2})$/.test(date)) {
      return buildError('Invalid date')
    }

    if (!/^(\d{2}):(\d{2})$/.test(time)) {
      return buildError('Invalid time')
    }

    const fullName = typeof patient?.full_name === 'string' ? patient.full_name.trim() : ''
    const cpf = typeof patient?.cpf === 'string' ? patient.cpf.trim() : ''
    const phone = typeof patient?.phone === 'string' ? patient.phone.trim() : ''
    const email = typeof patient?.email === 'string' ? patient.email.trim() : ''
    const emergencyContact = typeof patient?.emergency_contact === 'string' ? patient.emergency_contact.trim() : ''
    const sessionFrequency = typeof patient?.session_frequency === 'string' ? patient.session_frequency.trim() : 'weekly'

    if (!fullName || !cpf || !phone || !emergencyContact) {
      return buildError('Missing required patient fields')
    }

    const offset = timezone || getEnv('APP_TIMEZONE') || '-03:00'
    const dateTime = new Date(`${date}T${time}:00${offset}`)
    if (Number.isNaN(dateTime.getTime())) {
      return buildError('Invalid session datetime')
    }
    if (dateTime.getTime() <= Date.now()) {
      return buildError('Horario indisponivel', 409)
    }

    const dateRange = getDateRangeIso(date, offset)
    if (!dateRange) {
      return buildError('Invalid date range')
    }

    const { startIso, endIso } = dateRange
    const { data: existingSessions, error: sessionsError } = await adminClient
      .from('sessions')
      .select('id, session_date, duration_minutes, payment_status')
      .eq('user_id', link.user_id)
      .gte('session_date', startIso)
      .lt('session_date', endIso)
      .neq('payment_status', 'cancelled')

    if (sessionsError) {
      console.error('Erro ao validar sessoes:', sessionsError)
      return buildError('Failed to validate sessions', 500)
    }

    const conflict = findConflict((existingSessions || []) as SessionRow[], dateTime)
    if (conflict) {
      return buildError('Horario indisponivel', 409)
    }

    const { data: profile } = await adminClient
      .from('profiles')
      .select('session_price')
      .eq('user_id', link.user_id)
      .maybeSingle()

    const sessionPrice = profile?.session_price ?? null

    const { data: createdPatient, error: patientError } = await adminClient
      .from('patients')
      .insert({
        user_id: link.user_id,
        full_name: fullName,
        cpf,
        phone,
        email: email || null,
        emergency_contact: emergencyContact,
        session_frequency: sessionFrequency || 'weekly',
        session_price: sessionPrice,
        active: false,
        is_temp: true
      })
      .select('id')
      .single()

    if (patientError || !createdPatient) {
      console.error('Erro ao criar paciente:', patientError)
      return buildError('Failed to create patient', 500)
    }

    const { data: createdSession, error: sessionError } = await adminClient
      .from('sessions')
      .insert({
        user_id: link.user_id,
        patient_id: createdPatient.id,
        session_date: dateTime.toISOString(),
        duration_minutes: DEFAULT_SESSION_DURATION_MINUTES,
        session_type: 'Sessao Individual',
        session_price: sessionPrice,
        payment_status: 'pending'
      })
      .select('id')
      .single()

    if (sessionError || !createdSession) {
      console.error('Erro ao criar sessao:', sessionError)
      return buildError('Failed to create session', 500)
    }

    return new Response(
      JSON.stringify({ ok: true, patient_id: createdPatient.id, session_id: createdSession.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return buildError('Invalid action')
})
