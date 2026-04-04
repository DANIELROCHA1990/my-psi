/// <reference path="../deno.d.ts" />
import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'
import { getBearerToken, requireAuth } from '../_shared/auth.ts'
import { ensurePatientOwnership, ensureMedicalRecord } from '../_shared/medical.ts'
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
    const purpose = typeof body?.purpose === 'string' ? body.purpose.trim() : ''

    if (!patientId) {
      return errorResponse('missing_patient_id', 400)
    }

    await ensurePatientOwnership(auth.userId, patientId)
    const record = await ensureMedicalRecord(auth.userId, patientId)

    const admin = getAdminClient()

    const { data: entries, error } = await admin
      .schema('clinical')
      .from('medical_record_entries')
      .select('id,entry_type,event_at,title_redacted,content_enc,source_session_id,created_at,updated_at')
      .eq('medical_record_id', record.id)
      .eq('user_id', auth.userId)
      .eq('is_deleted', false)
      .order('event_at', { ascending: false })

    if (error) {
      throw new Error('entries_query_failed')
    }

    const decryptedEntries = await Promise.all(
      (entries || []).map(async (entry) => ({
        id: entry.id,
        entry_type: entry.entry_type,
        event_at: entry.event_at,
        title_redacted: entry.title_redacted,
        source_session_id: entry.source_session_id,
        created_at: entry.created_at,
        updated_at: entry.updated_at,
        payload: await decryptPayload(entry.content_enc, {
          userId: auth.userId,
          patientId,
          medicalRecordId: record.id,
          resourceType: entry.entry_type,
          resourceId: entry.id
        })
      }))
    )

    const exportPayload = {
      generated_at: new Date().toISOString(),
      patient_id: patientId,
      medical_record_id: record.id,
      entries: decryptedEntries
    }

    const bytes = new TextEncoder().encode(JSON.stringify(exportPayload, null, 2))
    const exportId = crypto.randomUUID()
    const objectPath = `u/${auth.userId}/p/${patientId}/r/${record.id}/medical-export-${exportId}.json`

    const { error: uploadError } = await admin
      .storage
      .from('clinical-exports-private')
      .upload(objectPath, new Blob([bytes], { type: 'application/json' }), {
        contentType: 'application/json',
        upsert: true
      })

    if (uploadError) {
      throw new Error('export_upload_failed')
    }

    await admin.schema('clinical').from('medical_record_export_log').insert({
      user_id: auth.userId,
      actor_user_id: auth.userId,
      patient_id: patientId,
      medical_record_id: record.id,
      export_type: 'json',
      file_path: objectPath,
      export_reason: purpose || null,
      result: 'success'
    })

    const { data: signedData } = await admin
      .storage
      .from('clinical-exports-private')
      .createSignedUrl(objectPath, 120)

    await writeMedicalAudit({
      userId: auth.userId,
      actorUserId: auth.userId,
      patientId,
      medicalRecordId: record.id,
      resourceType: 'medical_record',
      resourceId: record.id,
      action: 'export_json',
      purpose,
      origin: 'export-medical-record',
      userAgent: req.headers.get('user-agent'),
      result: 'success'
    })

    return jsonResponse({ ok: true, path: objectPath, signedUrl: signedData?.signedUrl || null, expiresIn: 120 })
  } catch (error) {
    const message = String((error as Error)?.message || 'internal_error')
    if (message === 'missing_auth_token' || message === 'unauthorized') {
      return errorResponse('unauthorized', 401)
    }
    if (message === 'patient_not_found_or_forbidden') {
      return errorResponse('forbidden', 403)
    }
    return errorResponse('failed_to_export_medical_record', 500)
  }
})

