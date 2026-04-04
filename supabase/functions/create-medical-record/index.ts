/// <reference path="../deno.d.ts" />
import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'
import { getBearerToken, requireAuth } from '../_shared/auth.ts'
import { ensurePatientOwnership, ensureMedicalRecord, refreshClinicalStatus } from '../_shared/medical.ts'
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
    const purpose = typeof body?.purpose === 'string' ? body.purpose.trim() : ''

    if (!patientId) {
      return errorResponse('missing_patient_id', 400)
    }

    await ensurePatientOwnership(auth.userId, patientId)
    const record = await ensureMedicalRecord(auth.userId, patientId)
    await refreshClinicalStatus(auth.userId, patientId).catch(() => null)

    await writeMedicalAudit({
      userId: auth.userId,
      actorUserId: auth.userId,
      patientId,
      medicalRecordId: record.id,
      resourceType: 'medical_record',
      resourceId: record.id,
      action: 'create_or_get_record',
      purpose,
      origin: 'create-medical-record',
      userAgent: req.headers.get('user-agent'),
      result: 'success'
    })

    return jsonResponse({
      ok: true,
      record: {
        id: record.id,
        patient_id: record.patient_id,
        user_id: record.user_id,
        record_status: record.record_status,
        opened_at: record.opened_at,
        last_entry_at: record.last_entry_at,
        has_pending_evolution: record.has_pending_evolution,
        has_pending_document: record.has_pending_document,
        alert_level: record.alert_level
      }
    })
  } catch (error) {
    const message = String((error as Error)?.message || 'internal_error')

    if (message === 'missing_auth_token' || message === 'unauthorized') {
      return errorResponse('unauthorized', 401)
    }
    if (message === 'patient_not_found_or_forbidden') {
      return errorResponse('forbidden', 403)
    }

    return errorResponse('failed_to_create_medical_record', 500, message)
  }
})

