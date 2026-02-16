// MultipleFiles/SessionService.ts

import { supabase } from '../lib/supabase'
import { Session, SessionSchedule } from '../types'
import { addDays, addWeeks, parseISO, format } from 'date-fns'
import { DEFAULT_SESSION_DURATION_MINUTES, findSessionConflict, getFirstAvailableSessionStart } from '../lib/scheduling'

/**
 * ðŸ”§ UtilitÃírio: Converte um objeto Date (que ? sempre no fuso horÃírio local do ambiente)
 * para uma string ISO 8601 em UTC (com o 'Z' no final).
 *
 * Exemplo:
 * Se o fuso horÃírio local ? UTC-3 (Brasil) e 'date' representa 2023-10-25 09:00:00 local,
 * este m?todo retornarÃí "2023-10-25T12:00:00.000Z".
 *
 * Isso garante que a data e hora agendadas localmente sejam corretamente
 * convertidas e armazenadas em um formato universal (UTC) no banco de dados.
 *
 * @param date O objeto Date local a ser convertido.
 * @returns Uma string ISO 8601 representando a data em UTC.
 */
function toISOStringUTC(date: Date): string {
  return date.toISOString()
}

function hasTimezoneInfo(value: string): boolean {
  return /Z$|[+-]\d{2}:?\d{2}$/.test(value)
}

function normalizeSessionDateValue(value: string | Date): string {
  if (value instanceof Date) {
    return toISOStringUTC(value)
  }

  if (hasTimezoneInfo(value)) {
    return value
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return toISOStringUTC(parsed)
}

function getFrequencyIntervalWeeks(frequency?: string) {
  switch (frequency) {
    case 'biweekly':
      return 2
    case 'monthly':
      return 4
    case 'as_needed':
      return 0
    default:
      return 1
  }
}

const syncPatientMeetEventDate = async (params: {
  patientId: string
  sessionDate: string
  durationMinutes?: number | null
}) => {
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    let session = sessionData.session
    const now = Math.floor(Date.now() / 1000)

    if (!session || (session.expires_at && session.expires_at - now < 60)) {
      const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession()
      if (refreshError || !refreshedData.session) {
        return
      }
      session = refreshedData.session
    }

    const accessToken = session.access_token || ''
    if (!accessToken) {
      return
    }

    const { error } = await supabase.functions.invoke('google-meet-link', {
      body: {
        patientId: params.patientId,
        sessionDate: params.sessionDate,
        durationMinutes: params.durationMinutes ?? DEFAULT_SESSION_DURATION_MINUTES,
        accessToken
      },
      headers: { Authorization: `Bearer ${accessToken}` }
    })

    if (error) {
      const message = String((error as { message?: string })?.message || '')
      if (
        message.toLowerCase().includes('google_not_connected') ||
        message.toLowerCase().includes('not connected')
      ) {
        return
      }
      console.error('Erro ao sincronizar data do Google Meet:', error)
    }
  } catch (error) {
    console.error('Erro ao sincronizar data do Google Meet:', error)
  }
}

const isMeetLink = (value?: string | null) => Boolean(value && value.includes('meet.google.com/'))

const fetchSessions = async (): Promise<Session[]> => {
  const { data, error } = await supabase
    .from('sessions')
    .select(`
      *,
      patients (
        id,
        full_name,
        email,
        phone,
        session_link,
        calendar_color,
        active,
        session_frequency,
        session_price,
        auto_renew_sessions,
        session_schedules
      )
    `)
    .order('session_date', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch sessions: ${error.message}`)
  }

  return data || []
}

const deriveSchedulesFromSessions = (sessions: Session[]): SessionSchedule[] => {
  const scheduleMap = new Map<string, SessionSchedule>()
  const sorted = [...sessions].sort(
    (a, b) => parseISO(b.session_date).getTime() - parseISO(a.session_date).getTime()
  )

  sorted.forEach((session) => {
    if (session.payment_status === 'cancelled') {
      return
    }

    const sessionDate = parseISO(session.session_date)
    const dayOfWeek = sessionDate.getDay()
    const time = format(sessionDate, 'HH:mm')
    const key = `${dayOfWeek}-${time}`

    if (!scheduleMap.has(key)) {
      scheduleMap.set(key, {
        dayOfWeek,
        time,
        paymentStatus: 'pending',
        sessionType: session.session_type || 'Sessao Individual',
        durationMinutes: session.duration_minutes ?? DEFAULT_SESSION_DURATION_MINUTES,
        sessionPrice: session.session_price ?? undefined
      })
    }
  })

  return Array.from(scheduleMap.values())
}

const autoRenewSessionsIfNeeded = async (sessions: Session[]) => {
  const now = new Date()
  const patientMap = new Map<string, { patient: Session['patients']; sessions: Session[]; hasFuture: boolean }>()

  sessions.forEach((session) => {
    const patient = session.patients
    if (!patient?.auto_renew_sessions || patient.active === false) {
      return
    }
    if (patient.session_frequency === 'as_needed') {
      return
    }

    const entry = patientMap.get(session.patient_id) || {
      patient,
      sessions: [],
      hasFuture: false
    }

    entry.sessions.push(session)

    if (session.payment_status !== 'cancelled' && parseISO(session.session_date) > now) {
      entry.hasFuture = true
    }

    patientMap.set(session.patient_id, entry)
  })

  const createdSessions: Session[] = []

  for (const [patientId, entry] of patientMap.entries()) {
    if (entry.hasFuture || entry.sessions.length === 0) {
      continue
    }

    const storedSchedules = entry.patient?.session_schedules || []
    const schedules = storedSchedules.length > 0 ? storedSchedules : deriveSchedulesFromSessions(entry.sessions)

    if (!schedules.length) {
      continue
    }

    const newSessions = await sessionService.createMultipleSessions(patientId, schedules, 12)
    createdSessions.push(...newSessions)
  }

  return createdSessions
}

export const sessionService = {
  /**
   * Busca todas as sessões do banco de dados, incluindo os dados do paciente associado.
   * As sessões sÃúo ordenadas pela data da sessão em ordem decrescente.
   * @returns Uma Promise que resolve para um array de objetos Session.
   * @throws Erro se a busca falhar.
   */
  async getSessions(): Promise<Session[]> {
    const data = await fetchSessions()
    const renewedSessions = await autoRenewSessionsIfNeeded(data)
    if (!renewedSessions.length) {
      return data
    }
    return [...data, ...renewedSessions].sort(
      (a, b) => parseISO(b.session_date).getTime() - parseISO(a.session_date).getTime()
    )
  },

  /**
   * Busca as próximas sessões (com data maior ou igual Ãá data atual).
   * As sessões sÃúo ordenadas pela data da sessão em ordem crescente.
   * A comparaÃ§Ãúo ? feita em UTC para garantir consist?ncia com o banco de dados.
   * @returns Uma Promise que resolve para um array de objetos Session.
   * @throws Erro se a busca falhar.
   */
  async getUpcomingSessions(): Promise<Session[]> {
    // Obt?m a data e hora atual em UTC para comparaÃ§Ãúo consistente com o banco de dados.
    const now = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('sessions')
      .select(`
        *,
        patients (
          id,
          full_name,
          email,
          phone,
          session_link,
          calendar_color,
          active,
          session_frequency,
          session_price,
          auto_renew_sessions,
          session_schedules
        )
      `)
      .gte('session_date', now) // Compara com a string ISO UTC
      .order('session_date', { ascending: true })

    if (error) {
      throw new Error(`Failed to fetch upcoming sessions: ${error.message}`)
    }

    return data || []
  },

  /**
   * Busca uma sessão específica pelo seu ID.
   * Inclui todos os dados detalhados do paciente associado.
   * @param id O ID da sessão.
   * @returns Uma Promise que resolve para o objeto Session ou null se não encontrada.
   * @throws Erro se a busca falhar por outro motivo que não seja "não encontrada".
   */
  async getSession(id: string): Promise<Session | null> {
    const { data, error } = await supabase
      .from('sessions')
      .select(`
        *,
        patients (
          id,
          full_name,
          email,
          phone,
          birth_date,
          cpf,
          address,
          city,
          state,
          zip_code,
          session_link,
          calendar_color,
          emergency_contact,
          emergency_phone,
          medical_history,
          current_medications,
          therapy_goals,
          session_frequency,
          session_price,
          active
        )
      `)
      .eq('id', id)
      .single()

    if (error) {
      // PGRST116 ? o c?digo de erro para "nÃúo encontrado" no Supabase (PostgREST)
      if (error.code === 'PGRST116') {
        return null
      }
      throw new Error(`Failed to fetch session: ${error.message}`)
    }

    return data
  },

  /**
   * Cria uma nova sessão no banco de dados.
   * Garante que a 'session_date' seja convertida para UTC antes de ser salva.
   * @param session O objeto Session (sem 'id', 'created_at', 'user_id').
   * @returns Uma Promise que resolve para o objeto Session criado.
   * @throws Erro se a criação falhar.
   */
  async createSession(session: Omit<Session, 'id' | 'created_at' | 'user_id'>): Promise<Session> {
    const sessionData = {
      ...session,
      duration_minutes: DEFAULT_SESSION_DURATION_MINUTES,
      // Converte a data da sessão para uma string ISO 8601 UTC antes de salvar.
      // Assume que session.session_date pode vir como string (já formatada) ou Date.
      session_date: normalizeSessionDateValue(session.session_date)
    }
    
    const { data, error } = await supabase
      .from('sessions')
      .insert([sessionData])
      .select(`
        *,
        patients (
          id,
          full_name,
          email,
          phone,
          session_link,
          calendar_color
        )
      `)
      .single()

    if (error) {
      throw new Error(`Failed to create session: ${error.message}`)
    }

    if (isMeetLink(data.patients?.session_link)) {
      await syncPatientMeetEventDate({
        patientId: data.patient_id,
        sessionDate: data.session_date,
        durationMinutes: data.duration_minutes
      })
    }

    return data
  },

  /**
   * Atualiza uma sessão existente no banco de dados.
   * Garante que a 'session_date' (se fornecida) seja convertida para UTC antes de ser salva.
   * @param id O ID da sessão a ser atualizada.
   * @param updates Um objeto com os campos a serem atualizados.
   * @returns Uma Promise que resolve para o objeto Session atualizado.
   * @throws Erro se a atualização falhar. 
   */
  async updateSession(id: string, updates: Partial<Session>): Promise<Session> {
    const updateData = { ...updates }
    if (updateData.session_date) {
      // Converte a data da sessão para uma string ISO 8601 UTC antes de salvar, se a data for atualizada.
      updateData.session_date = normalizeSessionDateValue(updateData.session_date)
    }
    updateData.duration_minutes = DEFAULT_SESSION_DURATION_MINUTES
    
    const { data, error } = await supabase
      .from('sessions')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        patients (
          id,
          full_name,
          email,
          phone,
          session_link,
          calendar_color
        )
      `)
      .single()

    if (error) {
      throw new Error(`Failed to update session: ${error.message}`)
    }

    let updatedSession = data

    if (updates.payment_status === 'cancelled') {
      const sessionDate = parseISO(updatedSession.session_date)
      if (sessionDate >= new Date()) {
        if (updatedSession.session_price !== null && updatedSession.session_price !== undefined) {
          const { data: clearedSession, error: clearError } = await supabase
            .from('sessions')
            .update({ session_price: null })
            .eq('id', id)
            .select(`
              *,
              patients (
                id,
                full_name,
                email,
                phone,
                session_link,
                calendar_color
              )
            `)
            .single()

          if (clearError) {
            console.error('Error clearing session price for cancelled session:', clearError)
          } else {
            updatedSession = clearedSession
          }
        }

        const { error: financialError } = await supabase
          .from('financial_records')
          .delete()
          .eq('session_id', id)

        if (financialError) {
          console.error('Error deleting financial record for cancelled session:', financialError)
        }
      }
    }

    if (
      updateData.session_date &&
      updatedSession.payment_status !== 'cancelled' &&
      isMeetLink(updatedSession.patients?.session_link)
    ) {
      await syncPatientMeetEventDate({
        patientId: updatedSession.patient_id,
        sessionDate: updatedSession.session_date,
        durationMinutes: updatedSession.duration_minutes
      })
    }

    return updatedSession
  },

  /**
   * Exclui uma sessão do banco de dados.
   * @param id O ID da sessão a ser excluída.
   * @returns Uma Promise vazia.
   * @throws Erro se a exclusão falhar.
   */
  async deleteSession(id: string): Promise<void> {
    const { error } = await supabase
      .from('sessions')
      .delete()
      .eq('id', id)

    if (error) {
      throw new Error(`Failed to delete session: ${error.message}`)
    }
  },

  /**
   * Cria múltiplas sessões recorrentes para um paciente.
   * Calcula as datas das sessões com base nos agendamentos e número de semanas,
   * garantindo que as datas sejam salvas em UTC.
   * @param patientId O ID do paciente.
   * @param schedules Um array de objetos com o dia da semana (0=Dom, 6=Sáb), hora e status de pagamento.
   * @param weeksToCreate O número de semanas para criar sessões (padrão: 12).
   * @returns Uma Promise que resolve para um array de objetos Session criados.
   * @throws Erro se a criação falhar.
   */
  async createMultipleSessions(
    patientId: string, 
    schedules: SessionSchedule[],
    weeksToCreate: number = 12
  ): Promise<Session[]> {
    const sessions: any[] = []
    
    // Obt?m a data e hora atual no fuso horÃírio local do ambiente.
    const nowLocal = new Date();

    // Buscar dados do paciente para pegar o pre?o da sessÃúo
    const { data: patient } = await supabase
      .from('patients')
      .select('session_price, session_frequency')
      .eq('id', patientId)
      .single()

    const frequency = patient?.session_frequency || 'weekly'
    const intervalWeeks = getFrequencyIntervalWeeks(frequency)
    const occurrences = intervalWeeks === 0
      ? 1
      : Math.max(1, Math.ceil(weeksToCreate / intervalWeeks))
    
    for (const schedule of schedules) {
      const [hours, minutes] = schedule.time.split(':').map(Number)
      const baseDate = new Date(nowLocal)
      baseDate.setHours(hours, minutes, 0, 0)

      const currentDay = baseDate.getDay()
      let daysToAdd = schedule.dayOfWeek - currentDay
      if (daysToAdd < 0) {
        daysToAdd += 7
      }
      if (daysToAdd === 0 && baseDate < nowLocal) {
        daysToAdd = 7
      }

      const firstSessionDateLocal = addDays(baseDate, daysToAdd)

      for (let occurrence = 0; occurrence < occurrences; occurrence++) {
        const sessionDateLocal = intervalWeeks === 0
          ? firstSessionDateLocal
          : addWeeks(firstSessionDateLocal, occurrence * intervalWeeks)

        sessions.push({
          patient_id: patientId,
          // Converte a data e hora final (que estÃí no fuso horÃírio local) para UTC
          // antes de enviar para o banco de dados.
          session_date: toISOStringUTC(sessionDateLocal),
          duration_minutes: DEFAULT_SESSION_DURATION_MINUTES,
          session_type: schedule.sessionType || 'Sessao Individual',
          session_price: schedule.sessionPrice ?? (patient?.session_price || null),
          payment_status: schedule.paymentStatus || 'pending',
          summary: null,
          session_notes: null,
          mood_before: null,
          mood_after: null,
          homework_assigned: null,
          next_session_date: null
        })
      }
    }

    const existingSessions = await fetchSessions()
    const plannedSessions: Session[] = []

    for (const session of sessions) {
      const candidateStart = parseISO(session.session_date)
      const conflict = findSessionConflict(
        [...existingSessions, ...plannedSessions],
        candidateStart
      )

      if (conflict) {
        const conflictName = conflict.patients?.full_name || 'outro paciente'
        const nextAvailableStart = getFirstAvailableSessionStart(
          [...existingSessions, ...plannedSessions],
          candidateStart
        )
        const conflictError = new Error(`Conflito de horário com sessão de ${conflictName}`)
        ;(conflictError as any).code = 'SCHEDULE_CONFLICT'
        ;(conflictError as any).conflict = {
          patientName: conflictName,
          nextAvailableStart
        }
        throw conflictError
      }

      plannedSessions.push({
        id: `planned-${plannedSessions.length}`,
        patient_id: session.patient_id,
        session_date: session.session_date,
        duration_minutes: session.duration_minutes,
        session_type: session.session_type,
        session_price: session.session_price,
        payment_status: session.payment_status,
        user_id: ''
      } as Session)
    }
    
    const { data, error } = await supabase
      .from('sessions')
      .insert(sessions)
      .select(`
        *,
        patients (
          id,
          full_name,
          email,
          phone,
          session_link,
          calendar_color
        )
      `)
    
    if (error) {
      throw new Error(`Failed to create multiple sessions: ${error.message}`)
    }

    return data || []
  },
  /**
   * Atualiza o status de pagamento de multiplas sessoes.
   * @param sessionIds IDs das sessoes para atualizar.
   * @param paymentStatus Novo status de pagamento.
   */
  async updateSessionsStatus(
    sessionIds: string[],
    paymentStatus: string
  ): Promise<Session[]> {
    if (sessionIds.length === 0) {
      return []
    }

    const { data, error } = await supabase
      .from('sessions')
      .update({ payment_status: paymentStatus })
      .in('id', sessionIds)
      .select(`
        *,
        patients (
          id,
          full_name,
          email,
          phone,
          session_link,
          calendar_color
        )
      `)

    if (error) {
      throw new Error(`Failed to update sessions status: ${error.message}`)
    }

    let updatedSessions = data || []

    if (paymentStatus === 'cancelled') {
      const now = new Date()
      const futureSessions = updatedSessions.filter((session) => {
        const sessionDate = parseISO(session.session_date)
        return sessionDate >= now
      })
      const futureIds = futureSessions.map((session) => session.id)

      if (futureIds.length > 0) {
        const { data: clearedSessions, error: clearError } = await supabase
          .from('sessions')
          .update({ session_price: null })
          .in('id', futureIds)
          .select(`
            *,
            patients (
              id,
              full_name,
              email,
              phone,
              session_link,
              calendar_color
            )
          `)

        if (clearError) {
          console.error('Error clearing session price for cancelled sessions:', clearError)
        } else if (clearedSessions?.length) {
          const sessionMap = new Map(updatedSessions.map((session) => [session.id, session]))
          clearedSessions.forEach((session) => sessionMap.set(session.id, session))
          updatedSessions = Array.from(sessionMap.values())
        }

        const { error: financialError } = await supabase
          .from('financial_records')
          .delete()
          .in('session_id', futureIds)

        if (financialError) {
          console.error('Error deleting financial records for cancelled sessions:', financialError)
        }
      }
    }

    return updatedSessions
  },
  /**
   * Remarca uma sessao e sincroniza a data financeira quando ja estiver paga.
   */
  async rescheduleSession(sessionId: string, sessionDate: string): Promise<Session> {
    const updatedSession = await this.updateSession(sessionId, {
      session_date: sessionDate
    })

    if (updatedSession.payment_status === 'paid') {
      const transactionDate = updatedSession.session_date.slice(0, 10)

      const { error } = await supabase
        .from('financial_records')
        .update({ transaction_date: transactionDate })
        .eq('session_id', sessionId)

      if (error) {
        console.error('Error updating financial record date for session:', error)
      }
    }

    return updatedSession
  },
  /**
   * Substitui sessões futuras (nÃúo pagas) de um paciente por novas sessões automÃíticas.
   * @param patientId O ID do paciente.
   * @param schedules Um array de agendamentos recorrentes.
   * @param weeksToCreate O n?mero de semanas para recriar sessões.
   */
  async replaceFutureSessions(
    patientId: string,
    schedules: SessionSchedule[],
    weeksToCreate: number = 12
  ): Promise<Session[]> {
    const now = new Date().toISOString()

    const { error: deleteError } = await supabase
      .from('sessions')
      .delete()
      .eq('patient_id', patientId)
      .gte('session_date', now)
      .neq('payment_status', 'paid')

    if (deleteError) {
      throw new Error(`Failed to replace sessions: ${deleteError.message}`)
    }

    return this.createMultipleSessions(patientId, schedules, weeksToCreate)
  }
}



