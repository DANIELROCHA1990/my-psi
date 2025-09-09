import { supabase } from '../lib/supabase'
import { Session } from '../types'
import { addWeeks, format, setHours, setMinutes, startOfWeek, addDays, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

function toUTCISOStringLocal(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`
}

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
    
    const today = new Date()
    today.setHours(0, 0, 0, 0) // Zerar horas para trabalhar apenas com datas
    
    // Buscar dados do paciente para pegar o preço da sessão
    const { data: patient } = await supabase
      .from('patients')
      .select('session_price')
      .eq('id', patientId)
      .single()
    
    for (let week = 0; week < weeksToCreate; week++) {
      for (const schedule of schedules) {
        // Encontrar a próxima ocorrência do dia da semana especificado
        let sessionDate = new Date(today)
        sessionDate.setDate(today.getDate() + (week * 7))
        
        // Ajustar para o dia da semana correto
        const currentDayOfWeek = sessionDate.getDay()
        const targetDayOfWeek = schedule.dayOfWeek
        
        // Calcular quantos dias adicionar para chegar no dia desejado
        let daysToAdd = targetDayOfWeek - currentDayOfWeek
        if (daysToAdd < 0) {
          daysToAdd += 7 // Se o dia já passou nesta semana, ir para a próxima
        }
        
        sessionDate.setDate(sessionDate.getDate() + daysToAdd)
        
        // Pular sessões que já passaram (apenas para a primeira semana)
        if (sessionDate < today) {
          continue
        }
        
        // Definir o horário específico
        const [hours, minutes] = schedule.time.split(':').map(Number)
        sessionDate.setHours(hours, minutes, 0, 0)
        
        sessions.push({
          patient_id: patientId,
          session_date: toUTCISOStringLocal(selectedDate),
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