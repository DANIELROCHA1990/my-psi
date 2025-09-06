import { supabase } from '../lib/supabase'
import { Session } from '../types'

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
    const { data, error } = await supabase
      .from('sessions')
      .insert([session])
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
    const { data, error } = await supabase
      .from('sessions')
      .update(updates)
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
  }
}