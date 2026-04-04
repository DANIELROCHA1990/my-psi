/// <reference path="../deno.d.ts" />
import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'
import { getBearerToken, requireAuth } from '../_shared/auth.ts'
import { encryptPayload } from '../_shared/crypto.ts'
import { refreshClinicalStatus } from '../_shared/medical.ts'
import { writeMedicalAudit, writeMedicalChange } from '../_shared/audit.ts'
import { getAdminClient } from '../_shared/supabase.ts'

const DETAIL_TABLES = [
  { table: 'medical_record_anamnesis', encColumn: 'anamnesis_text_enc' },
  { table: 'medical_record_objective_exams', encColumn: 'objective_exam_text_enc' },
  { table: 'medical_record_evolutions', encColumn: 'evolution_text_enc' },
  { table: 'medical_record_prescriptions', encColumn: 'prescription_detail_enc' },
  { table: 'medical_record_exam_requests', encColumn: 'exam_request_text_enc' },
  { table: 'medical_record_referrals', encColumn: 'referral_description_enc' },
  { table: 'medical_record_active_problems', encColumn: 'problem_text_enc' },
  { table: 'medical_record_current_interventions', encColumn: 'intervention_text_enc' },
  { table: 'medical_record_alerts', encColumn: 'alert_text_enc' },
  { table: 'medical_record_documents', encColumn: 'document_text_enc' }
]

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
    const entryId = typeof body?.entryId === 'string' ? body.entryId.trim() : ''
    const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {}
    const purpose = typeof body?.purpose === 'string' ? body.purpose.trim() : ''
    const titleRedacted = typeof body?.titleRedacted === 'string' ? body.titleRedacted.trim() : null

    if (!entryId) {
      return errorResponse('missing_entry_id', 400)
    }

    const admin = getAdminClient()
    const clinical = admin.schema('clinical')

    const { data: currentEntry, error: currentError } = await clinical
      .from('medical_record_entries')
      .select('*')
      .eq('id', entryId)
      .eq('user_id', auth.userId)
      .maybeSingle()

    if (currentError || !currentEntry) {
      return errorResponse('forbidden', 403)
    }

    const encrypted = await encryptPayload(payload, {
      userId: auth.userId,
      patientId: currentEntry.patient_id,
      medicalRecordId: currentEntry.medical_record_id,
      resourceType: currentEntry.entry_type,
      resourceId: currentEntry.id
    })

    const { error: updateError } = await clinical
      .from('medical_record_entries')
      .update({
        content_enc: encrypted.enc,
        content_sha256: encrypted.sha,
        crypto_version: encrypted.version,
        title_redacted: titleRedacted,
        updated_by: auth.userId,
        updated_at: new Date().toISOString()
      })
      .eq('id', entryId)
      .eq('user_id', auth.userId)

    if (updateError) {
      throw new Error('entry_update_failed')
    }

    for (const detail of DETAIL_TABLES) {
      await clinical
        .from(detail.table)
        .update({
          [detail.encColumn]: encrypted.enc,
          payload_sha256: encrypted.sha,
          crypto_version: encrypted.version,
          updated_by: auth.userId,
          updated_at: new Date().toISOString()
        })
        .eq('entry_id', entryId)
        .eq('user_id', auth.userId)
    }

    await clinical
      .from('medical_records')
      .update({
        last_entry_at: new Date().toISOString(),
        updated_by: auth.userId
      })
      .eq('id', currentEntry.medical_record_id)
      .eq('user_id', auth.userId)

    await refreshClinicalStatus(auth.userId, currentEntry.patient_id)

    await writeMedicalChange({
      userId: auth.userId,
      actorUserId: auth.userId,
      patientId: currentEntry.patient_id,
      medicalRecordId: currentEntry.medical_record_id,
      resourceType: 'medical_record_entry',
      resourceId: currentEntry.id,
      action: 'update',
      beforeChecksum: currentEntry.content_sha256,
      afterChecksum: encrypted.sha,
      changeSummaryRedacted: `entry_type:${currentEntry.entry_type}`,
      cryptoVersion: encrypted.version
    })

    await writeMedicalAudit({
      userId: auth.userId,
      actorUserId: auth.userId,
      patientId: currentEntry.patient_id,
      medicalRecordId: currentEntry.medical_record_id,
      resourceType: 'medical_record_entry',
      resourceId: currentEntry.id,
      action: 'update_entry',
      purpose,
      origin: 'update-medical-entry',
      userAgent: req.headers.get('user-agent'),
      result: 'success'
    })

    return jsonResponse({ ok: true, entryId })
  } catch (error) {
    const message = String((error as Error)?.message || 'internal_error')

    if (message === 'missing_auth_token' || message === 'unauthorized') {
      return errorResponse('unauthorized', 401)
    }

    return errorResponse('failed_to_update_entry', 500)
  }
})

