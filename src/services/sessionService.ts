import { supabase } from '../lib/supabase'
import { Session } from '../types'
import { addWeeks, format, setHours, setMinutes, startOfWeek, addDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'

/**
 * 🔧 Utilitário: Converte um objeto Date para uma string no formato ISO sem timezone (YYYY-MM-DDTHH:mm:ss)
 * Isso garante que a data seja tratada como "local" pelo banco de dados, sem conversões de timezone.
 * 
 * Exemplo: Se 'date' representa 2023-10-25 09:00:00 local,
 * este método retornará "2023-10-25T09:00:00".
 * 
 * @param date O objeto Date local a ser convertido.
 * @returns Uma string ISO sem timezone representando a data local.
 */
function toLocalISOString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`
}

/**
 * 🔧 Utilitário: Converte uma string de data (com ou sem timezone) para um objeto Date local
 * Isso garante que sempre trabalhemos com datas locais, ignorando qualquer informação de timezone.
 * 
 * @param dateString A string de data a ser convertida.
 * @returns Um objeto Date representando a data/hora local.
 */
function parseLocalDate(dateString: string): Date {
  // Remove qualquer informação de timezone (Z, +00:00, etc.)
  const cleanDateString = dateString.replace(/[Z]|[+-]\d{2}:\d{2}$/g, '')
  
  // Se a string não tem horário, adiciona 00:00:00
  const fullDateString = cleanDateString.includes('T') 
    ? cleanDateString 
    : `${cleanDateString}T00:00:00`
  
  // Cria o Date usando o construtor que interpreta como horário local
  return new Date(fullDateString)
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
   * A comparação é feita usando datas locais.
   * @returns Uma Promise que resolve para um array de objetos Session.
   * @throws Erro se a busca falhar.
   */
  async getUpcomingSessions(): Promise<Session[]> {
    // Obtém a data e hora atual local no formato ISO sem timezone
    const now = toLocalISOString(new Date())
    
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
      .gte('session_date', now)
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
   * Garante que a 'session_date' seja salva como horário local.
   * @param session O objeto Session (sem 'id', 'created_at', 'user_id').
   * @returns Uma Promise que resolve para o objeto Session criado.
   * @throws Erro se a criação falhar.
   */
  async createSession(session: Omit<Session, 'id' | 'created_at' | 'user_id'>): Promise<Session> {
    const sessionData = {
      ...session,
      // Converte a data da sessão para string ISO local antes de salvar
      session_date: typeof session.session_date === 'string' 
        ? toLocalISOString(parseLocalDate(session.session_date))
        : toLocalISOString(new Date(session.session_date))
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

    return data
  },

  /**
   * Atualiza uma sessão existente no banco de dados.
   * Garante que a 'session_date' (se fornecida) seja salva como horário local.
   * @param id O ID da sessão a ser atualizada.
   * @param updates Um objeto com os campos a serem atualizados.
   * @returns Uma Promise que resolve para o objeto Session atualizado.
   * @throws Erro se a atualização falhar.
   */
  async updateSession(id: string, updates: Partial<Session>): Promise<Session> {
    const updateData = { ...updates }
    if (updateData.session_date) {
      // Converte a data da sessão para string ISO local antes de salvar
      updateData.session_date = typeof updateData.session_date === 'string' 
        ? toLocalISOString(parseLocalDate(updateData.session_date))
        : toLocalISOString(new Date(updateData.session_date))
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
   * garantindo que as datas sejam salvas como horário local.
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
    
    // Obtém a data atual local e zera as horas para ter um ponto de partida limpo
    const nowLocal = new Date()
    nowLocal.setHours(0, 0, 0, 0)
    
    // Buscar dados do paciente para pegar o preço da sessão
    const { data: patient } = await supabase
      .from('patients')
      .select('session_price')
      .eq('id', patientId)
      .single()
    
    for (let week = 0; week < weeksToCreate; week++) {
      for (const schedule of schedules) {
        // 1. Começar com uma cópia da data atual local
        let sessionDateLocal = new Date(nowLocal)
        
        // 2. Adicionar as semanas à data base
        sessionDateLocal.setDate(sessionDateLocal.getDate() + (week * 7))
        
        // 3. Ajustar para o dia da semana correto
        const currentDayOfWeek = sessionDateLocal.getDay()
        const targetDayOfWeek = schedule.dayOfWeek
        
        let daysToAdd = targetDayOfWeek - currentDayOfWeek
        if (daysToAdd < 0) {
          daysToAdd += 7
        }
        
        sessionDateLocal.setDate(sessionDateLocal.getDate() + daysToAdd)
        
        // 4. Definir o horário específico (horas e minutos)
        const [hours, minutes] = schedule.time.split(':').map(Number)
        sessionDateLocal.setHours(hours, minutes, 0, 0)
        
        // 5. Pular sessões que já passaram
        if (sessionDateLocal < new Date()) {
          continue
        }
        
        sessions.push({
          patient_id: patientId,
          // 6. Converte a data final para string ISO local
          session_date: toLocalISOString(sessionDateLocal),
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
    
    return data || []
  }
}