/// <reference path="../deno.d.ts" />
import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'
import { getBearerToken, requireAuth } from '../_shared/auth.ts'
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
    const attachmentId = typeof body?.attachmentId === 'string' ? body.attachmentId.trim() : ''
    const purpose = typeof body?.purpose === 'string' ? body.purpose.trim() : ''

    if (!attachmentId) {
      return errorResponse('missing_attachment_id', 400)
    }

    const admin = getAdminClient()

    const { data: attachment, error } = await admin
      .schema('clinical')
      .from('medical_record_attachments')
      .select('id,user_id,patient_id,medical_record_id,bucket_id,object_path,deleted_at')
      .eq('id', attachmentId)
      .eq('user_id', auth.userId)
      .maybeSingle()

    if (error || !attachment || attachment.deleted_at) {
      return errorResponse('forbidden', 403)
    }

    const expiresIn = 60
    const { data: signedData, error: signedError } = await admin
      .storage
      .from(attachment.bucket_id)
      .createSignedUrl(attachment.object_path, expiresIn)

    if (signedError || !signedData?.signedUrl) {
      throw new Error('create_signed_url_failed')
    }

    await writeMedicalAudit({
      userId: auth.userId,
      actorUserId: auth.userId,
      patientId: attachment.patient_id,
      medicalRecordId: attachment.medical_record_id,
      resourceType: 'medical_record_attachment',
      resourceId: attachment.id,
      action: 'download_attachment',
      purpose,
      origin: 'get-medical-attachment-url',
      userAgent: req.headers.get('user-agent'),
      result: 'success'
    })

    return jsonResponse({ ok: true, signedUrl: signedData.signedUrl, expiresIn })
  } catch (error) {
    const message = String((error as Error)?.message || 'internal_error')

    if (message === 'missing_auth_token' || message === 'unauthorized') {
      return errorResponse('unauthorized', 401)
    }

    return errorResponse('failed_to_get_attachment_url', 500)
  }
})

