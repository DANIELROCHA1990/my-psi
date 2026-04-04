import { getAdminClient } from './supabase.ts'

export type AuditEvent = {
  userId: string
  actorUserId?: string
  patientId?: string | null
  medicalRecordId?: string | null
  resourceType: string
  resourceId?: string | null
  action: string
  purpose?: string | null
  origin?: string | null
  ip?: string | null
  userAgent?: string | null
  result: 'success' | 'denied' | 'error'
  resultCode?: string | null
  requestId?: string | null
}

export const writeMedicalAudit = async (event: AuditEvent) => {
  try {
    const admin = getAdminClient()
    await admin.schema('clinical').from('medical_record_access_audit').insert({
      user_id: event.userId,
      actor_user_id: event.actorUserId || event.userId,
      patient_id: event.patientId || null,
      medical_record_id: event.medicalRecordId || null,
      resource_type: event.resourceType,
      resource_id: event.resourceId || null,
      action: event.action,
      purpose: event.purpose || null,
      origin: event.origin || null,
      ip: event.ip || null,
      user_agent: event.userAgent || null,
      result: event.result,
      result_code: event.resultCode || null,
      request_id: event.requestId || null
    })
  } catch (_error) {
    // Never break business flow due to audit insertion failure.
  }
}

export const writeMedicalChange = async (params: {
  userId: string
  actorUserId: string
  patientId: string
  medicalRecordId: string
  resourceType: string
  resourceId: string
  action: string
  beforeChecksum?: string | null
  afterChecksum?: string | null
  changeSummaryRedacted?: string | null
  diffEnc?: unknown
  cryptoVersion?: number | null
}) => {
  try {
    const admin = getAdminClient()
    await admin.schema('clinical').from('medical_record_change_history').insert({
      user_id: params.userId,
      actor_user_id: params.actorUserId,
      patient_id: params.patientId,
      medical_record_id: params.medicalRecordId,
      resource_type: params.resourceType,
      resource_id: params.resourceId,
      action: params.action,
      before_checksum: params.beforeChecksum || null,
      after_checksum: params.afterChecksum || null,
      change_summary_redacted: params.changeSummaryRedacted || null,
      diff_enc: params.diffEnc || null,
      crypto_version: params.cryptoVersion || null
    })
  } catch (_error) {
    // no-op
  }
}

