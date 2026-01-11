// MultipleFiles/SessionService.ts

import { supabase } from '../lib/supabase'
import { Session } from '../types'
import { addDays, addWeeks } from 'date-fns'
import { notificationService } from './notificationService'

/**
 * 🔧 Utilitário: Converte um objeto Date (que é sempre no fuso horário local do ambiente)
 * para uma string ISO 8601 em UTC (com o 'Z' no final).
 *
 * Exemplo:
 * Se o fuso horário local é UTC-3 (Brasil) e 'date' representa 2023-10-25 09:00:00 local,
 * este método retornará "2023-10-25T12:00:00.000Z".
 *
 * Isso garante que a data e hora agendadas localmente sejam corretamente
 * convertidas e armazenadas em um formato universal (UTC) no banco de dados.
 *
 * @param date O objeto Date local a ser convertido.
 * @returns Uma string ISO 8601 representando a data em UTC.
 */
function toISOStringUTC(date: Date): string {
  return date.toISOString();
}

export const sessionService = {
  /**
   * Busca todas as sessões do banco de dados, incluindo os dados do paciente associado.
   * As sessões são ordenadas pela data da sessão em ordem decrescente.
   * @returns Uma Promise que resolve para um array de objetos Session.
   * @throws Erro se a busca falhar.
   */
  async getSessions(): Promise<Session[]> {
    const { data, error } = await supabase
      .from('sessions')
      .select(`
        *,
        patients (
          id,
          full_name,
          email,
          phone
        )
      `)
      .order('session_date', { ascending: false })

    if (error) {
      throw new Error(`Failed to fetch sessions: ${error.message}`)
    }

    return data || []
  },

  /**
   * Busca as próximas sessões (com data maior ou igual à data atual).
   * As sessões são ordenadas pela data da sessão em ordem crescente.
   * A comparação é feita em UTC para garantir consistência com o banco de dados.
   * @returns Uma Promise que resolve para um array de objetos Session.
   * @throws Erro se a busca falhar.
   */
  async getUpcomingSessions(): Promise<Session[]> {
    // Obtém a data e hora atual em UTC para comparação consistente com o banco de dados.
    const now = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('sessions')
      .select(`
        *,
        patients (
          id,
          full_name,
          email,
          phone
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
      // PGRST116 é o código de erro para "não encontrado" no Supabase (PostgREST)
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
      // Converte a data da sessão para uma string ISO 8601 UTC antes de salvar.
      // Assume que session.session_date pode vir como string (já formatada) ou Date.
      session_date: typeof session.session_date === 'string' 
        ? session.session_date 
        : toISOStringUTC(new Date(session.session_date))
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
          phone
        )
      `)
      .single()

    if (error) {
      throw new Error(`Failed to create session: ${error.message}`)
    }

    try {
      await notificationService.ensureSessionNotifications([data])
    } catch (integrationError) {
      console.error('Error integrating session with notifications:', integrationError)
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
      updateData.session_date = typeof updateData.session_date === 'string' 
        ? updateData.session_date 
        : toISOStringUTC(new Date(updateData.session_date))
    }
    
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
          phone
        )
      `)
      .single()

    if (error) {
      throw new Error(`Failed to update session: ${error.message}`)
    }

    try {
      await notificationService.ensureSessionNotifications([data], { updateExisting: true })
    } catch (integrationError) {
      console.error('Error integrating updated session with notifications:', integrationError)
    }

    return data
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
    schedules: Array<{dayOfWeek: number, time: string, paymentStatus: string}>,
    weeksToCreate: number = 12
  ): Promise<Session[]> {
    const sessions: any[] = []
    
    // Obtém a data e hora atual no fuso horário local do ambiente.
    const nowLocal = new Date();

    // Buscar dados do paciente para pegar o preço da sessão
    const { data: patient } = await supabase
      .from('patients')
      .select('session_price')
      .eq('id', patientId)
      .single()
    
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

      for (let week = 0; week < weeksToCreate; week++) {
        const sessionDateLocal = addWeeks(firstSessionDateLocal, week)

        sessions.push({
          patient_id: patientId,
          // Converte a data e hora final (que está no fuso horário local) para UTC
          // antes de enviar para o banco de dados.
          session_date: toISOStringUTC(sessionDateLocal),
          duration_minutes: 50,
          session_type: 'Sessão Individual',
          session_price: patient?.session_price || null,
          payment_status: schedule.paymentStatus,
          summary: null,
          session_notes: null,
          mood_before: null,
          mood_after: null,
          homework_assigned: null,
          next_session_date: null
        })
      }
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
          phone
        )
      `)
    
    if (error) {
      throw new Error(`Failed to create multiple sessions: ${error.message}`)
    }

    if (data?.length) {
      try {
        await notificationService.ensureSessionNotifications(data)
      } catch (integrationError) {
        console.error('Error integrating sessions with notifications:', integrationError)
      }
    }
    
    return data || []
  },
  /**
   * Substitui sessões futuras (não pagas) de um paciente por novas sessões automáticas.
   * @param patientId O ID do paciente.
   * @param schedules Um array de agendamentos recorrentes.
   * @param weeksToCreate O número de semanas para recriar sessões.
   */
  async replaceFutureSessions(
    patientId: string,
    schedules: Array<{dayOfWeek: number, time: string, paymentStatus: string}>,
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
