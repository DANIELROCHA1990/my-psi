// SessionService.ts

import { supabase } from '../lib/supabase'
import { Session } from '../types'
import { addWeeks, format, setHours, setMinutes, startOfWeek, addDays, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// 🔧 Utilitário: Converte um objeto Date (que é local) para uma string ISO 8601 UTC
// Ex: Se date é 2023-10-25 09:00:00 (local, UTC-3), retorna "2023-10-25T12:00:00Z"
function toISOStringUTC(date: Date): string {
  return date.toISOString(); // O método toISOString() de Date já retorna a data em UTC com 'Z'
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
    // Ao comparar com now, é importante que now também seja UTC para uma comparação correta com o banco de dados
    const now = new Date().toISOString(); // toISOString() já retorna em UTC
    
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
    const sessionData = {
      ...session,
      // Se session.session_date já é uma string ISO UTC (ex: vindo de um date picker que já lida com UTC), use-a.
      // Caso contrário, converta o objeto Date local para string ISO UTC.
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

    return data
  },

  async updateSession(id: string, updates: Partial<Session>): Promise<Session> {
    const updateData = { ...updates }
    if (updateData.session_date) {
      // Mesma lógica de conversão para UTC ao atualizar
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
    
    // Obter a data atual no fuso horário local, mas zerar o tempo para comparações de dia
    const todayLocal = new Date();
    todayLocal.setHours(0, 0, 0, 0); 
    
    // Buscar dados do paciente para pegar o preço da sessão
    const { data: patient } = await supabase
      .from('patients')
      .select('session_price')
      .eq('id', patientId)
      .single()
    
    for (let week = 0; week < weeksToCreate; week++) {
      for (const schedule of schedules) {
        // Começar com a data de hoje (local) e adicionar as semanas
        let sessionDateLocal = new Date(todayLocal);
        sessionDateLocal.setDate(todayLocal.getDate() + (week * 7));
        
        // Ajustar para o dia da semana correto (0 = Dom, 1 = Seg, ..., 6 = Sáb)
        const currentDayOfWeek = sessionDateLocal.getDay();
        const targetDayOfWeek = schedule.dayOfWeek;
        
        let daysToAdd = targetDayOfWeek - currentDayOfWeek;
        if (daysToAdd < 0) {
          daysToAdd += 7; // Se o dia já passou nesta semana, ir para a próxima
        }
        
        sessionDateLocal.setDate(sessionDateLocal.getDate() + daysToAdd);
        
        // Definir o horário específico no objeto Date local
        const [hours, minutes] = schedule.time.split(':').map(Number);
        sessionDateLocal.setHours(hours, minutes, 0, 0); 
        
        // Pular sessões que já passaram (comparação no fuso horário local)
        if (sessionDateLocal < todayLocal) {
          continue;
        }
        
        sessions.push({
          patient_id: patientId,
          session_date: toISOStringUTC(sessionDateLocal), // <-- CONVERTER PARA UTC AQUI
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
