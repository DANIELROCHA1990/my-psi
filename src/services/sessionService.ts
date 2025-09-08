import { supabase } from '../lib/supabase'
import { Session } from '../types'
import { addWeeks, format, setHours, setMinutes, startOfWeek, addDays, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export const sessionService = {
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

  async getUpcomingSessions(): Promise<Session[]> {
    const now = new Date().toISOString()
    
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
      if (error.code === 'PGRST116') {
        return null
      }
      throw new Error(`Failed to fetch session: ${error.message}`)
    }

    return data
  },

  async createSession(session: Omit<Session, 'id' | 'created_at' | 'user_id'>): Promise<Session> {
    // Garantir que a data seja tratada corretamente
    const sessionData = {
      ...session,
      session_date: typeof session.session_date === 'string' 
        ? session.session_date 
        : new Date(session.session_date).toISOString()
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

  async updateSession(id: string, updates: Partial<Session>): Promise<Session> {
    // Garantir que a data seja tratada corretamente se fornecida
    const updateData = { ...updates }
    if (updateData.session_date) {
      updateData.session_date = typeof updateData.session_date === 'string' 
        ? updateData.session_date 
        : new Date(updateData.session_date).toISOString()
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

  async deleteSession(id: string): Promise<void> {
    const { error } = await supabase
      .from('sessions')
      .delete()
      .eq('id', id)

    if (error) {
      throw new Error(`Failed to delete session: ${error.message}`)
    }
  },

  async createMultipleSessions(
    patientId: string, 
    schedules: Array<{dayOfWeek: number, time: string, paymentStatus: string}>,
    weeksToCreate: number = 12
  ): Promise<Session[]> {
    const sessions: any[] = []
    
    // Usar a próxima segunda-feira como referência para evitar problemas de timezone
    const today = new Date()
    const currentDay = today.getDay() // 0 = domingo, 1 = segunda, etc.
    const daysUntilMonday = currentDay === 0 ? 1 : (8 - currentDay) % 7
    const nextMonday = new Date(today)
    nextMonday.setDate(today.getDate() + daysUntilMonday)
    nextMonday.setHours(0, 0, 0, 0) // Zerar horas para evitar problemas de timezone
    
    // Buscar dados do paciente para pegar o preço da sessão
    const { data: patient } = await supabase
      .from('patients')
      .select('session_price')
      .eq('id', patientId)
      .single()
    
    for (let week = 0; week < weeksToCreate; week++) {
      for (const schedule of schedules) {
        // Calcular a data da sessão baseada na segunda-feira de referência
        const weekStart = addWeeks(nextMonday, week)
        
        // Calcular quantos dias adicionar à segunda-feira para chegar no dia desejado
        // schedule.dayOfWeek: 0=domingo, 1=segunda, 2=terça, 3=quarta, 4=quinta, 5=sexta, 6=sábado
        let daysToAdd = schedule.dayOfWeek === 0 ? 6 : schedule.dayOfWeek - 1 // Converter para dias desde segunda
        
        const sessionDate = addDays(weekStart, daysToAdd)
        
        // Pular sessões que já passaram (apenas para a primeira semana)
        if (week === 0 && sessionDate < today) {
          continue
        }
        
        const [hours, minutes] = schedule.time.split(':').map(Number)
        const sessionDateTime = setMinutes(setHours(sessionDate, hours), minutes)
        
        sessions.push({
          patient_id: patientId,
          session_date: sessionDateTime.toISOString(),
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