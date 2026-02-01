/// <reference path="../deno.d.ts" />
import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import nodemailer from 'npm:nodemailer@6.9.8'

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
  session_date: string
  duration_minutes: number | null
  session_type: string | null
  session_price: number | null
  payment_status: string | null
  summary: string | null
  session_notes: string | null
  patients?: { full_name: string | null }
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const formatDateLabel = (dateString: string) => {
  const [year, month, day] = dateString.split('-')
  if (!year || !month || !day) {
    return dateString
  }
  return `${day}/${month}/${year}`
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const getStatusLabel = (status: string | null) => {
  if (status === 'paid') return 'Pago'
  if (status === 'cancelled') return 'Cancelado'
  return 'Pendente'
}

const getStatusColors = (status: string | null) => {
  if (status === 'paid') {
    return { badgeBg: '#dcfce7', badgeText: '#166534' }
  }
  if (status === 'cancelled') {
    return { badgeBg: '#f3f4f6', badgeText: '#374151' }
  }
  return { badgeBg: '#ffedd5', badgeText: '#9a3412' }
}

const formatSessionTypeLabel = (value?: string | null) => {
  if (!value) {
    return 'Sessao'
  }
  const normalized = value.toLowerCase()
  if (normalized.includes('individual')) return 'Sessao Individual'
  if (normalized.includes('grupo')) return 'Sessao em Grupo'
  if (normalized.includes('familiar')) return 'Sessao Familiar'
  if (normalized.includes('avaliacao')) return 'Avaliacao'
  if (normalized.includes('retorno')) return 'Retorno'
  if (normalized.includes('sess')) return 'Sessao'
  return value
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

const decodeJwtPayload = (token: string) => {
  const [, payload] = token.split('.')
  if (!payload) {
    return null
  }
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const decoded = atob(padded)
    return JSON.parse(decoded) as Record<string, unknown>
  } catch (error) {
    return null
  }
}

const buildAgendaHtml = (
  dateLabel: string,
  sessions: SessionRow[],
  professional?: string | null,
  location?: string | null
) => {
  const notesItems = sessions
    .map((session) => {
      const notes = (session.summary || session.session_notes || '').trim()
      if (!notes) {
        return null
      }
      const patientName = session.patients?.full_name || 'Paciente'
      return `<li style="margin: 6px 0; color: #4b5563;"><strong>Obs ${escapeHtml(
        patientName
      )}:</strong> ${escapeHtml(notes)}</li>`
    })
    .filter(Boolean)
    .join('')

  const notesSection = notesItems
    ? `
      <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0 0 8px; font-weight: 600; color: #111827;">Observacoes</p>
        <ul style="margin: 0; padding-left: 16px;">
          ${notesItems}
        </ul>
      </div>
    `
    : ''

  const rows = sessions.length
    ? sessions
        .map((session) => {
          const statusLabel = getStatusLabel(session.payment_status)
          const statusColors = getStatusColors(session.payment_status)
          const price =
            session.session_price !== null ? formatCurrency(session.session_price) : 'Valor nao informado'
          return `
            <tr>
              <td style="padding: 10px 12px; border-top: 1px solid #e5e7eb;">${escapeHtml(
                session.session_date
              )}</td>
              <td style="padding: 10px 12px; border-top: 1px solid #e5e7eb;">${escapeHtml(
                session.patients?.full_name || 'Paciente'
              )}</td>
              <td style="padding: 10px 12px; border-top: 1px solid #e5e7eb;">${
                session.duration_minutes ?? 50
              } min</td>
              <td style="padding: 10px 12px; border-top: 1px solid #e5e7eb;">
                <span style="background: ${statusColors.badgeBg}; color: ${statusColors.badgeText}; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600;">
                  ${statusLabel}
                </span>
              </td>
              <td style="padding: 10px 12px; border-top: 1px solid #e5e7eb;">${price}</td>
            </tr>
          `
        })
        .join('')
    : ''

  const emptyState = sessions.length
    ? ''
    : `<p style="color: #6b7280;">Nao ha agendamentos para esta data.</p>`

  const professionalLine = professional
    ? `<p style="margin: 4px 0; color: #4b5563;">Profissional: ${escapeHtml(professional)}</p>`
    : ''
  const locationLine = location
    ? `<p style="margin: 4px 0; color: #4b5563;">Local: ${escapeHtml(location)}</p>`
    : ''

  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; background: #f9fafb; padding: 24px;">
      <div style="max-width: 720px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 24px;">
        <p style="margin: 0 0 8px; color: #111827;">Ola,</p>
        <p style="margin: 0 0 16px; color: #4b5563;">Segue abaixo sua agenda do dia <strong>${dateLabel}</strong>:</p>
        ${professionalLine}
        ${locationLine}
        ${emptyState}
        ${
          sessions.length
            ? `
              <table style="width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 14px; color: #111827;">
                <thead>
                  <tr style="text-align: left; background: #f3f4f6;">
                    <th style="padding: 10px 12px;">Horario</th>
                    <th style="padding: 10px 12px;">Paciente</th>
                    <th style="padding: 10px 12px;">Duracao</th>
                    <th style="padding: 10px 12px;">Status</th>
                    <th style="padding: 10px 12px;">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows}
                </tbody>
              </table>
            `
            : ''
        }
        ${notesSection}
      </div>
    </div>
  `
}

const buildAgendaText = (
  dateLabel: string,
  sessions: SessionRow[],
  professional?: string | null,
  location?: string | null
) => {
  const headerLines = [
    `Agenda - ${dateLabel}`,
    professional ? `Profissional: ${professional}` : null,
    location ? `Local: ${location}` : null
  ].filter(Boolean)

  if (!sessions.length) {
    return `${headerLines.join('\n')}\n\nNao ha agendamentos para esta data.`
  }

  const lines = sessions.map((session) => {
    const price =
      session.session_price !== null ? formatCurrency(session.session_price) : 'Valor nao informado'
    return `${session.session_date} | ${session.patients?.full_name || 'Paciente'} | ${
      session.duration_minutes ?? 50
    } min | ${getStatusLabel(session.payment_status)} | ${price}`
  })

  const notesLines = sessions
    .map((session) => {
      const notes = (session.summary || session.session_notes || '').trim()
      if (!notes) {
        return null
      }
      const patientName = session.patients?.full_name || 'Paciente'
      return `Obs ${patientName}: ${notes}`
    })
    .filter(Boolean)

  const notesBlock = notesLines.length ? `\n\nObservacoes:\n${notesLines.join('\n')}` : ''

  return `${headerLines.join('\n')}\n\n${lines.join('\n')}${notesBlock}`
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
    console.log('send-agenda-email headers keys:', [...req.headers.keys()])
    console.log('send-agenda-email authHeader present?', Boolean(authHeader))
    console.log('send-agenda-email authHeader len:', authHeader.length)
    console.log('send-agenda-email authHeader prefix:', authHeader.slice(0, 20))

    const body = await req.json()
    const date = typeof body?.date === 'string' ? body.date.trim() : ''
    const bodyToken = typeof body?.accessToken === 'string' ? body.accessToken.trim() : ''
    const token = authHeader
      ? authHeader.replace(/^Bearer\s+/i, '').trim()
      : bodyToken

    console.log('send-agenda-email token len:', token.length)
    console.log('send-agenda-email token prefix:', token.slice(0, 12))
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

    console.log('send-agenda-email supabaseUrl:', supabaseUrl)
    console.log('send-agenda-email anonKey len:', anonKey.length)

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
    const decodedPayload = decodeJwtPayload(token)
    const tokenEmail =
      typeof decodedPayload?.email === 'string'
        ? decodedPayload.email
        : typeof decodedPayload?.user_metadata === 'object' &&
            decodedPayload?.user_metadata !== null &&
            typeof (decodedPayload.user_metadata as Record<string, unknown>).email === 'string'
        ? (decodedPayload.user_metadata as Record<string, string>).email
        : null

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
        session_date,
        duration_minutes,
        session_type,
        session_price,
        payment_status,
        summary,
        session_notes,
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
      if (String(sessionsError.message || '').toLowerCase().includes('jwt')) {
        return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({ ok: false, error: 'Failed to fetch sessions' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const offsetMinutes = getOffsetMinutes(timezone)
    const normalizedSessions = (sessions as SessionRow[] | null)?.map((session) => ({
      ...session,
      session_date: formatTimeWithOffset(session.session_date, offsetMinutes)
    })) ?? []

    const { data: profile, error: profileError } = await authClient
      .from('profiles')
      .select('full_name,address,city,state,email')
      .maybeSingle()

    if (profileError) {
      console.error('Erro ao buscar perfil:', profileError)
    }

    const professional = profile?.full_name || null
    const locationParts = [profile?.address, profile?.city, profile?.state].filter(Boolean)
    const location = locationParts.length ? locationParts.join(' - ') : null

    const dateLabel = formatDateLabel(date)

    const userEmail = profile?.email || tokenEmail
    if (!userEmail) {
      return new Response(JSON.stringify({ ok: false, error: 'User email not available' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const smtpHost = Deno.env.get('SMTP_HOST') ?? ''
    const smtpPort = Number(Deno.env.get('SMTP_PORT') ?? '587')
    const smtpUser = Deno.env.get('SMTP_USER') ?? ''
    const smtpPass = Deno.env.get('SMTP_PASS') ?? ''
    const smtpFrom = Deno.env.get('SMTP_FROM') ?? ''
    const smtpFromName = Deno.env.get('SMTP_FROM_NAME') ?? 'Agenda'

    if (!smtpHost || !smtpFrom) {
      return new Response(JSON.stringify({ ok: false, error: 'SMTP not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: smtpUser ? { user: smtpUser, pass: smtpPass } : undefined
    })

    await transporter.sendMail({
      from: `${smtpFromName} <${smtpFrom}>`,
      to: userEmail,
      subject: `Agenda - ${dateLabel}`,
      text: buildAgendaText(dateLabel, normalizedSessions, professional, location),
      html: buildAgendaHtml(dateLabel, normalizedSessions, professional, location)
    })

    return new Response(JSON.stringify({ ok: true, count: normalizedSessions.length }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Erro ao enviar agenda:', error)
    return new Response(JSON.stringify({ ok: false, error: 'Failed to send agenda' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
