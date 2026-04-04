/// <reference path="../deno.d.ts" />
import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'
import { getBearerToken, requireAuth } from '../_shared/auth.ts'
import { encryptPayload } from '../_shared/crypto.ts'
import { ensurePatientOwnership, ensureMedicalRecord, refreshClinicalStatus } from '../_shared/medical.ts'
import { writeMedicalAudit, writeMedicalChange } from '../_shared/audit.ts'
import { getAdminClient } from '../_shared/supabase.ts'

const sanitizeExt = (name: string) => {
  const ext = name.split('.').pop() || ''
  const clean = ext.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
  return clean.slice(0, 10)
}

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
    const fileName = typeof body?.fileName === 'string' ? body.fileName.trim() : ''
    const mimeType = typeof body?.mimeType === 'string' ? body.mimeType.trim() : ''
    const sizeBytes = Number(body?.sizeBytes || 0)
    const purpose = typeof body?.purpose === 'string' ? body.purpose.trim() : ''

    if (!patientId || !fileName || !mimeType || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      return errorResponse('invalid_attachment_payload', 400)
    }

    await ensurePatientOwnership(auth.userId, patientId)
    const record = await ensureMedicalRecord(auth.userId, patientId)

    const attachmentId = crypto.randomUUID()
    const entryId = crypto.randomUUID()
    const ext = sanitizeExt(fileName)
    const objectPath = `u/${auth.userId}/p/${patientId}/r/${record.id}/${attachmentId}${ext ? `.${ext}` : ''}`

    const admin = getAdminClient()
    const bucket = 'clinical-attachments-private'

    const { data: signedUploadData, error: uploadError } = await admin
      .storage
      .from(bucket)
      .createSignedUploadUrl(objectPath)

    if (uploadError || !signedUploadData) {
      throw new Error('signed_upload_url_failed')
    }

    const encryptedName = await encryptPayload({ fileName, mimeType }, {
      userId: auth.userId,
      patientId,
      medicalRecordId: record.id,
      resourceType: 'attachment_name',
      resourceId: attachmentId
    })

    const encryptedMeta = await encryptPayload({
      source: 'medical_record_attachment',
      classification: typeof body?.classification === 'string' ? body.classification : 'clinical'
    }, {
      userId: auth.userId,
      patientId,
      medicalRecordId: record.id,
      resourceType: 'attachment_meta',
      resourceId: attachmentId
    })

    const encryptedEntry = await encryptPayload({
      attachmentId,
      mimeType,
      sizeBytes,
      fileExt: ext || null,
      uploadedAt: new Date().toISOString()
    }, {
      userId: auth.userId,
      patientId,
      medicalRecordId: record.id,
      resourceType: 'attachment',
      resourceId: entryId
    })

    const { error: entryInsertError } = await admin
      .schema('clinical')
      .from('medical_record_entries')
      .insert({
        id: entryId,
        medical_record_id: record.id,
        user_id: auth.userId,
        patient_id: patientId,
        entry_type: 'attachment',
        event_at: new Date().toISOString(),
        title_redacted: 'Anexo clínico',
        content_enc: encryptedEntry.enc,
        content_sha256: encryptedEntry.sha,
        crypto_version: encryptedEntry.version,
        has_sensitive_content: true,
        created_by: auth.userId,
        updated_by: auth.userId
      })

    if (entryInsertError) {
      throw new Error('attachment_entry_insert_failed')
    }

    const { error: insertError } = await admin
      .schema('clinical')
      .from('medical_record_attachments')
      .insert({
        id: attachmentId,
        medical_record_id: record.id,
        entry_id: entryId,
        user_id: auth.userId,
        patient_id: patientId,
        bucket_id: bucket,
        object_path: objectPath,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        file_ext: ext || null,
        original_name_enc: encryptedName.enc,
        metadata_enc: encryptedMeta.enc,
        uploaded_by: auth.userId
      })

    if (insertError) {
      throw new Error('attachment_insert_failed')
    }

    await admin
      .schema('clinical')
      .from('medical_records')
      .update({
        last_entry_at: new Date().toISOString(),
        updated_by: auth.userId
      })
      .eq('id', record.id)
      .eq('user_id', auth.userId)

    await refreshClinicalStatus(auth.userId, patientId)

    await writeMedicalChange({
      userId: auth.userId,
      actorUserId: auth.userId,
      patientId,
      medicalRecordId: record.id,
      resourceType: 'medical_record_attachment',
      resourceId: attachmentId,
      action: 'create_upload_url',
      afterChecksum: encryptedEntry.sha,
      changeSummaryRedacted: 'attachment_metadata_created',
      cryptoVersion: encryptedEntry.version
    })

    await writeMedicalAudit({
      userId: auth.userId,
      actorUserId: auth.userId,
      patientId,
      medicalRecordId: record.id,
      resourceType: 'medical_record_attachment',
      resourceId: attachmentId,
      action: 'create_signed_upload_url',
      purpose,
      origin: 'upload-medical-attachment-url',
      userAgent: req.headers.get('user-agent'),
      result: 'success'
    })

    return jsonResponse({
      ok: true,
      attachmentId,
      bucket,
      path: signedUploadData.path,
      token: signedUploadData.token,
      signedUrl: signedUploadData.signedUrl
    })
  } catch (error) {
    const message = String((error as Error)?.message || 'internal_error')

    if (message === 'missing_auth_token' || message === 'unauthorized') {
      return errorResponse('unauthorized', 401)
    }

    if (message === 'patient_not_found_or_forbidden') {
      return errorResponse('forbidden', 403)
    }

    return errorResponse('failed_to_prepare_attachment_upload', 500)
  }
})

