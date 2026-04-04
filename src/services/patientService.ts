import { supabase } from '../lib/supabase'
import { Patient } from '../types'

const PATIENT_SAFE_COLUMNS = `
  id,
  user_id,
  full_name,
  email,
  phone,
  address,
  created_at,
  birth_date,
  cpf,
  city,
  state,
  zip_code,
  emergency_contact,
  emergency_phone,
  session_frequency,
  session_price,
  session_link,
  meet_event_id,
  meet_calendar_id,
  calendar_color,
  auto_renew_sessions,
  session_schedules,
  active,
  is_temp,
  updated_at
`

const stripLegacyClinicalFields = <T extends Record<string, unknown>>(value: T): T => {
  const sanitized = { ...value }
  delete (sanitized as Record<string, unknown>).medical_history
  delete (sanitized as Record<string, unknown>).current_medications
  delete (sanitized as Record<string, unknown>).therapy_goals
  return sanitized as T
}

export const patientService = {
  async getPatients(): Promise<Patient[]> {
    const { data, error } = await supabase
      .from('patients')
      .select(PATIENT_SAFE_COLUMNS)
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
      .select(PATIENT_SAFE_COLUMNS)
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching patient:', error)
      return null
    }

    return data
  },

  async createPatient(patient: Omit<Patient, 'id' | 'created_at' | 'updated_at'>) {
    const { user_id, ...patientDataRaw } = patient as any
    const patientData = stripLegacyClinicalFields(patientDataRaw)

    const { data, error } = await supabase
      .from('patients')
      .insert([patientData])
      .select(PATIENT_SAFE_COLUMNS)
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
    const { id: patientId, created_at, updated_at, ...updateDataRaw } = updates
    const updateData = stripLegacyClinicalFields(updateDataRaw)

    const { data, error } = await supabase
      .from('patients')
      .update(updateData)
      .eq('id', id)
      .select(PATIENT_SAFE_COLUMNS)
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
