/// <reference path="../deno.d.ts" />
import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'
import { getBearerToken, requireAuth } from '../_shared/auth.ts'
import { encryptPayload } from '../_shared/crypto.ts'
import { ensurePatientOwnership, ensureMedicalRecord, refreshClinicalStatus } from '../_shared/medical.ts'
import { writeMedicalAudit, writeMedicalChange } from '../_shared/audit.ts'
import { getAdminClient } from '../_shared/supabase.ts'

const DETAIL_CONFIG: Record<string, { table: string; encColumn: string; dateColumn: string }> = {
  anamnesis: { table: 'medical_record_anamnesis', encColumn: 'anamnesis_text_enc', dateColumn: 'recorded_at' },
  objective_exam: { table: 'medical_record_objective_exams', encColumn: 'objective_exam_text_enc', dateColumn: 'exam_date' },
  evolution: { table: 'medical_record_evolutions', encColumn: 'evolution_text_enc', dateColumn: 'evolution_date' },
  prescription: { table: 'medical_record_prescriptions', encColumn: 'prescription_detail_enc', dateColumn: 'prescription_date' },
  exam_request: { table: 'medical_record_exam_requests', encColumn: 'exam_request_text_enc', dateColumn: 'request_date' },
  referral: { table: 'medical_record_referrals', encColumn: 'referral_description_enc', dateColumn: 'referral_date' },
  active_problem: { table: 'medical_record_active_problems', encColumn: 'problem_text_enc', dateColumn: 'started_at' },
  intervention: { table: 'medical_record_current_interventions', encColumn: 'intervention_text_enc', dateColumn: 'started_at' },
  alert: { table: 'medical_record_alerts', encColumn: 'alert_text_enc', dateColumn: 'created_at' },
  document: { table: 'medical_record_documents', encColumn: 'document_text_enc', dateColumn: 'created_at' }
}

const ALLOWED_ENTRY_TYPES = new Set([
  'anamnesis',
  'objective_exam',
  'evolution',
  'prescription',
  'document',
  'exam_request',
  'referral',
  'active_problem',
  'intervention',
  'alert',
  'attachment',
  'note'
])

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
    const entryType = typeof body?.entryType === 'string' ? body.entryType.trim() : ''
    const sourceSessionId = typeof body?.sourceSessionId === 'string' ? body.sourceSessionId.trim() : null
    const purpose = typeof body?.purpose === 'string' ? body.purpose.trim() : ''
    const titleRedacted = typeof body?.titleRedacted === 'string' ? body.titleRedacted.trim() : null
    const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {}

    if (!patientId || !entryType) {
      return errorResponse('missing_patient_or_entry_type', 400)
    }
    if (!ALLOWED_ENTRY_TYPES.has(entryType)) {
      return errorResponse('invalid_entry_type', 400)
    }

    await ensurePatientOwnership(auth.userId, patientId)
    const record = await ensureMedicalRecord(auth.userId, patientId)

    const entryId = crypto.randomUUID()
    const encrypted = await encryptPayload(payload, {
      userId: auth.userId,
      patientId,
      medicalRecordId: record.id,
      resourceType: entryType,
      resourceId: entryId
    })

    const admin = getAdminClient()
    const clinical = admin.schema('clinical')

    const { error: entryError } = await clinical.from('medical_record_entries').insert({
      id: entryId,
      medical_record_id: record.id,
      user_id: auth.userId,
      patient_id: patientId,
      entry_type: entryType,
      source_session_id: sourceSessionId,
      event_at: body?.eventAt || new Date().toISOString(),
      title_redacted: titleRedacted,
      content_enc: encrypted.enc,
      content_sha256: encrypted.sha,
      crypto_version: encrypted.version,
      has_sensitive_content: true,
      created_by: auth.userId,
      updated_by: auth.userId
    })

    if (entryError) {
      throw new Error('entry_insert_failed')
    }

    const detailConfig = DETAIL_CONFIG[entryType]
    if (detailConfig) {
      const detailPayload: Record<string, unknown> = {
        medical_record_id: record.id,
        entry_id: entryId,
        user_id: auth.userId,
        patient_id: patientId,
        payload_sha256: encrypted.sha,
        crypto_version: encrypted.version,
        created_by: auth.userId,
        updated_by: auth.userId,
        [detailConfig.encColumn]: encrypted.enc,
        [detailConfig.dateColumn]: body?.eventAt || new Date().toISOString()
      }

      if (entryType === 'evolution') {
        detailPayload.is_pending = Boolean(payload?.isPending)
        detailPayload.session_id = sourceSessionId
      }

      if (entryType === 'document') {
        detailPayload.document_type = typeof payload?.documentType === 'string' ? payload.documentType : 'clinical_document'
        detailPayload.sensitivity_level = 'clinical'
        detailPayload.generated_by = auth.userId
      }

      if (entryType === 'alert') {
        detailPayload.alert_code = typeof payload?.alertCode === 'string' ? payload.alertCode : 'clinical_alert'
        detailPayload.alert_level = Number(payload?.alertLevel || 1)
      }

      const { error: detailError } = await clinical.from(detailConfig.table).insert(detailPayload)
      if (detailError) {
        throw new Error('detail_insert_failed')
      }
    }

    const updateRecordPayload: Record<string, unknown> = {
      last_entry_at: new Date().toISOString(),
      updated_by: auth.userId
    }

    if (entryType === 'evolution') {
      updateRecordPayload.has_pending_evolution = Boolean(payload?.isPending)
    }

    if (entryType === 'document') {
      updateRecordPayload.has_pending_document = Boolean(payload?.isPendingDocument)
    }

    await clinical.from('medical_records').update(updateRecordPayload).eq('id', record.id)

    if (sourceSessionId) {
      const operationalSummary =
        typeof payload?.operationalSummary === 'string' && payload.operationalSummary.trim().length
          ? payload.operationalSummary.trim().slice(0, 255)
          : 'Registro cl�nico atualizado'

      await admin
        .from('sessions')
        .update({
          has_clinical_entry: true,
          clinical_entry_id: entryId,
          clinical_last_updated_at: new Date().toISOString(),
          requires_clinical_evolution: false,
          operational_summary: operationalSummary
        })
        .eq('id', sourceSessionId)
        .eq('user_id', auth.userId)
    }

    await refreshClinicalStatus(auth.userId, patientId)

    await writeMedicalChange({
      userId: auth.userId,
      actorUserId: auth.userId,
      patientId,
      medicalRecordId: record.id,
      resourceType: 'medical_record_entry',
      resourceId: entryId,
      action: 'create',
      afterChecksum: encrypted.sha,
      changeSummaryRedacted: `entry_type:${entryType}`,
      cryptoVersion: encrypted.version
    })

    await writeMedicalAudit({
      userId: auth.userId,
      actorUserId: auth.userId,
      patientId,
      medicalRecordId: record.id,
      resourceType: 'medical_record_entry',
      resourceId: entryId,
      action: 'create_entry',
      purpose,
      origin: 'create-medical-entry',
      userAgent: req.headers.get('user-agent'),
      result: 'success'
    })

    return jsonResponse({ ok: true, entryId, medicalRecordId: record.id })
  } catch (error) {
    const message = String((error as Error)?.message || 'internal_error')

    if (message === 'missing_auth_token' || message === 'unauthorized') {
      return errorResponse('unauthorized', 401)
    }

    if (message === 'patient_not_found_or_forbidden' || message === 'medical_record_not_found') {
      return errorResponse('forbidden', 403)
    }

    return errorResponse('failed_to_create_entry', 500)
  }
})


