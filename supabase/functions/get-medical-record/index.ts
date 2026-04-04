/// <reference path="../deno.d.ts" />
import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'
import { getBearerToken, requireAuth } from '../_shared/auth.ts'
import { ensurePatientOwnership, ensureMedicalRecord, getMedicalRecordById } from '../_shared/medical.ts'
import { decryptPayload } from '../_shared/crypto.ts'
import { writeMedicalAudit } from '../_shared/audit.ts'
import { getAdminClient } from '../_shared/supabase.ts'

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
    const recordIdFromBody = typeof body?.medicalRecordId === 'string' ? body.medicalRecordId.trim() : ''
    const includeEntries = body?.includeEntries !== false
    const limit = Math.min(Math.max(Number(body?.limit || 100), 1), 500)
    const purpose = typeof body?.purpose === 'string' ? body.purpose.trim() : ''

    let record: any

    if (recordIdFromBody) {
      record = await getMedicalRecordById(recordIdFromBody, auth.userId)
      await ensurePatientOwnership(auth.userId, record.patient_id)
    } else {
      if (!patientId) {
        return errorResponse('missing_patient_or_record', 400)
      }
      await ensurePatientOwnership(auth.userId, patientId)
      record = await ensureMedicalRecord(auth.userId, patientId)
    }

    const admin = getAdminClient()
    let entries: any[] = []
    let auditTrail: any[] = []
    let changeHistory: any[] = []

    if (includeEntries) {
      const { data, error } = await admin
        .schema('clinical')
        .from('medical_record_entries')
        .select('id,entry_type,event_at,title_redacted,content_enc,content_sha256,crypto_version,created_at,updated_at,source_session_id')
        .eq('medical_record_id', record.id)
        .eq('user_id', auth.userId)
        .eq('is_deleted', false)
        .order('event_at', { ascending: false })
        .limit(limit)

      if (error) {
        throw new Error('medical_entries_query_failed')
      }

      entries = await Promise.all(
        (data || []).map(async (entry) => {
          let payload: unknown = { unavailable: true }

          try {
            if (entry.content_enc) {
              payload = await decryptPayload(entry.content_enc, {
                userId: auth.userId,
                patientId: record.patient_id,
                medicalRecordId: record.id,
                resourceType: entry.entry_type,
                resourceId: entry.id
              })
            }
          } catch (_decryptError) {
            payload = {
              unavailable: true,
              reason: 'decrypt_failed'
            }
          }

          return {
            id: entry.id,
            entry_type: entry.entry_type,
            event_at: entry.event_at,
            title_redacted: entry.title_redacted,
            payload,
            source_session_id: entry.source_session_id,
            created_at: entry.created_at,
            updated_at: entry.updated_at
          }
        })
      )
    }

    const { data: auditRows, error: auditError } = await admin
      .schema('clinical')
      .from('medical_record_access_audit')
      .select('id,resource_type,resource_id,action,purpose,origin,result,result_code,created_at')
      .eq('medical_record_id', record.id)
      .eq('user_id', auth.userId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (!auditError) {
      auditTrail = auditRows || []
    }

    const { data: changeRows, error: changeError } = await admin
      .schema('clinical')
      .from('medical_record_change_history')
      .select('id,resource_type,resource_id,action,before_checksum,after_checksum,change_summary_redacted,created_at')
      .eq('medical_record_id', record.id)
      .eq('user_id', auth.userId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (!changeError) {
      changeHistory = changeRows || []
    }

    await writeMedicalAudit({
      userId: auth.userId,
      actorUserId: auth.userId,
      patientId: record.patient_id,
      medicalRecordId: record.id,
      resourceType: 'medical_record',
      resourceId: record.id,
      action: 'read_record',
      purpose,
      origin: 'get-medical-record',
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
        closed_at: record.closed_at,
        last_entry_at: record.last_entry_at,
        has_pending_evolution: record.has_pending_evolution,
        has_pending_document: record.has_pending_document,
        alert_level: record.alert_level,
        updated_at: record.updated_at
      },
      entries,
      auditTrail,
      changeHistory
    })
  } catch (error) {
    const message = String((error as Error)?.message || 'internal_error')
    if (message === 'missing_auth_token' || message === 'unauthorized') {
      return errorResponse('unauthorized', 401)
    }
    if (message === 'patient_not_found_or_forbidden' || message === 'medical_record_not_found') {
      return errorResponse('forbidden', 403)
    }
    return errorResponse('failed_to_read_medical_record', 500)
  }
})

