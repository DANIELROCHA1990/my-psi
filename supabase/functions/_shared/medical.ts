import { getAdminClient } from './supabase.ts'

export const ensurePatientOwnership = async (userId: string, patientId: string) => {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('patients')
    .select('id,user_id')
    .eq('id', patientId)
    .maybeSingle()

  if (error || !data || data.user_id !== userId) {
    throw new Error('patient_not_found_or_forbidden')
  }

  return data
}

export const getMedicalRecordById = async (recordId: string, userId: string) => {
  const admin = getAdminClient()
  const { data, error } = await admin
    .schema('clinical')
    .from('medical_records')
    .select('*')
    .eq('id', recordId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !data) {
    throw new Error('medical_record_not_found')
  }

  return data
}

export const ensureMedicalRecord = async (userId: string, patientId: string) => {
  const admin = getAdminClient()

  const { data: existingRows, error: existingError } = await admin
    .schema('clinical')
    .from('medical_records')
    .select('*')
    .eq('user_id', userId)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: true })
    .limit(1)

  if (existingError) {
    throw new Error('medical_record_lookup_failed')
  }

  const existing = Array.isArray(existingRows) ? existingRows[0] : null
  if (existing) {
    return existing
  }

  const { data: created, error: createError } = await admin
    .schema('clinical')
    .from('medical_records')
    .insert({
      user_id: userId,
      patient_id: patientId,
      created_by: userId,
      updated_by: userId
    })
    .select('*')
    .single()

  if (createError || !created) {
    const conflictCode = String((createError as any)?.code || '')
    if (conflictCode === '23505') {
      const { data: conflictRows, error: conflictError } = await admin
        .schema('clinical')
        .from('medical_records')
        .select('*')
        .eq('user_id', userId)
        .eq('patient_id', patientId)
        .order('created_at', { ascending: true })
        .limit(1)

      const conflictExisting = Array.isArray(conflictRows) ? conflictRows[0] : null
      if (!conflictError && conflictExisting) {
        return conflictExisting
      }
    }

    throw new Error('medical_record_create_failed')
  }

  return created
}

export const refreshClinicalStatus = async (userId: string, patientId: string) => {
  const admin = getAdminClient()
  await admin.schema('clinical').rpc('refresh_patient_clinical_status', {
    p_user_id: userId,
    p_patient_id: patientId
  })
}

