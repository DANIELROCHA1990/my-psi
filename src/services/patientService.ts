import { supabase } from '../lib/supabase'
import { Patient } from '../types'

export const patientService = {
  async getPatients(): Promise<Patient[]> {
    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .order('full_name', { ascending: true })

    if (error) {
      console.error('Error fetching patients:', error)
      return []
    }

    return data || []
  },

  async getPatient(id: string): Promise<Patient | null> {
    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching patient:', error)
      return null
    }

    return data
  },

  async createPatient(patient: Omit<Patient, 'id' | 'created_at' | 'updated_at'>) {
    // Remove user_id from the data since it will be set by the trigger  
    const { user_id, ...patientData } = patient as any
    
    console.log('Creating patient with data:', patientData)
    const { data, error } = await supabase
      .from('patients')
      .insert([patientData])
      .select()
      .single()

    if (error) {
      console.error('Error creating patient:', error)
      console.error('Error details:', error.details)
      console.error('Error hint:', error.hint)
      console.error('Error message:', error.message)
    }

    return { data, error }
  },

  async updatePatient(id: string, updates: Partial<Patient>) {
    // Remove readonly fields
    const { id: patientId, created_at, updated_at, ...updateData } = updates
    
    const { data, error } = await supabase
      .from('patients')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating patient:', error)
    }

    return { data, error }
  },

  async deletePatient(id: string) {
    const { error } = await supabase
      .from('patients')
      .delete()
      .eq('id', id)

    return { error }
  },

  async deactivatePatient(id: string) {
    const { error: updateError } = await supabase
      .from('patients')
      .update({ active: false })
      .eq('id', id)

    if (updateError) {
      console.error('Error deactivating patient:', updateError)
      return { error: updateError }
    }

    const nowIso = new Date().toISOString()

    const { data: futureSessions, error: futureSessionsError } = await supabase
      .from('sessions')
      .select('id')
      .eq('patient_id', id)
      .gte('session_date', nowIso)

    if (futureSessionsError) {
      console.error('Error fetching future sessions for patient:', futureSessionsError)
    }

    const futureSessionIds = (futureSessions || []).map((session) => session.id)
    let financialError: typeof futureSessionsError = null

    if (futureSessionIds.length > 0) {
      const { error } = await supabase
        .from('financial_records')
        .delete()
        .in('session_id', futureSessionIds)
      financialError = error
      if (financialError) {
        console.error('Error deleting future financial records for patient:', financialError)
      }
    }

    const { error: sessionsError } = await supabase
      .from('sessions')
      .delete()
      .eq('patient_id', id)
      .gte('session_date', nowIso)

    if (sessionsError) {
      console.error('Error deleting future sessions for patient:', sessionsError)
    }

    return { error: sessionsError || financialError || futureSessionsError }
  }
}
