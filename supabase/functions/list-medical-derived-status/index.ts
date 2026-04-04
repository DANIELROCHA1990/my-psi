/// <reference path="../deno.d.ts" />
import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'
import { getBearerToken, requireAuth } from '../_shared/auth.ts'
import { getAdminClient } from '../_shared/supabase.ts'
import { writeMedicalAudit } from '../_shared/audit.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return errorResponse('method_not_allowed', 405)
  }

  const body = await req.json().catch(() => ({}))
  const token = getBearerToken(req)

  try {
    const auth = await requireAuth(token)
    const patientId = typeof body?.patientId === 'string' ? body.patientId.trim() : ''

    const admin = getAdminClient()
    let patientsQuery = admin
      .from('patients')
      .select('id,full_name,active,updated_at')
      .eq('user_id', auth.userId)
      .order('full_name', { ascending: true })

    if (patientId) {
      patientsQuery = patientsQuery.eq('id', patientId)
    }

    const { data: patientsData, error: patientsError } = await patientsQuery
    if (patientsError) {
      throw new Error('patients_query_failed')
    }

    let statusQuery = admin
      .from('patient_clinical_status')
      .select('patient_id,medical_record_id,has_record,has_pending_evolution,has_pending_document,alert_level,last_evolution_at,last_entry_at,updated_at')
      .eq('user_id', auth.userId)
      .order('updated_at', { ascending: false })

    if (patientId) {
      statusQuery = statusQuery.eq('patient_id', patientId)
    }

    const { data: statusData, error: statusError } = await statusQuery
    if (statusError) {
      throw new Error('derived_status_query_failed')
    }

    const statusByPatientId = new Map((statusData || []).map((row) => [row.patient_id, row]))

    const rows = (patientsData || []).map((patient) => {
      const status = statusByPatientId.get(patient.id)
      return {
        patient_id: patient.id,
        medical_record_id: status?.medical_record_id || null,
        has_record: status?.has_record || false,
        has_pending_evolution: status?.has_pending_evolution || false,
        has_pending_document: status?.has_pending_document || false,
        alert_level: status?.alert_level || 0,
        last_evolution_at: status?.last_evolution_at || null,
        last_entry_at: status?.last_entry_at || null,
        updated_at: status?.updated_at || patient.updated_at || null,
        patient: {
          id: patient.id,
          full_name: patient.full_name,
          active: patient.active
        }
      }
    })

    await writeMedicalAudit({
      userId: auth.userId,
      actorUserId: auth.userId,
      resourceType: 'patient_clinical_status',
      action: 'list_derived_status',
      origin: 'list-medical-derived-status',
      userAgent: req.headers.get('user-agent'),
      result: 'success'
    })

    return jsonResponse({ ok: true, rows })
  } catch (error) {
    const message = String((error as Error)?.message || 'internal_error')

    if (message === 'missing_auth_token' || message === 'unauthorized') {
      return errorResponse('unauthorized', 401)
    }

    return errorResponse('failed_to_list_derived_status', 500)
  }
})

