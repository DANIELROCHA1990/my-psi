/// <reference path="../deno.d.ts" />
import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'
import { getBearerToken, requireAuth } from '../_shared/auth.ts'
import { decryptPayload, encryptPayload, getActiveCryptoVersion } from '../_shared/crypto.ts'
import { getAdminClient } from '../_shared/supabase.ts'
import { writeMedicalAudit } from '../_shared/audit.ts'

const parseAllowedAdmins = () => {
  const raw = (Deno.env.get('MEDICAL_ROTATION_ADMIN_IDS') || '').trim()
  return raw ? raw.split(',').map((value) => value.trim()).filter(Boolean) : []
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
    const admins = parseAllowedAdmins()
    if (!admins.includes(auth.userId)) {
      return errorResponse('forbidden', 403)
    }

    const fromVersion = Number(body?.fromVersion || 0)
    const dryRun = body?.dryRun !== false
    const limit = Math.min(Math.max(Number(body?.limit || 200), 1), 1000)

    if (!fromVersion) {
      return errorResponse('missing_from_version', 400)
    }

    const activeVersion = getActiveCryptoVersion()
    if (activeVersion === fromVersion && !dryRun) {
      return errorResponse('active_version_matches_from_version', 400)
    }

    const admin = getAdminClient()
    const clinical = admin.schema('clinical')

    const { data: rows, error } = await clinical
      .from('medical_record_entries')
      .select('id,user_id,patient_id,medical_record_id,entry_type,content_enc,crypto_version')
      .eq('crypto_version', fromVersion)
      .eq('is_deleted', false)
      .limit(limit)

    if (error) {
      throw new Error('rotation_query_failed')
    }

    if (dryRun) {
      return jsonResponse({ ok: true, dryRun: true, pending: (rows || []).length, fromVersion, toVersion: activeVersion })
    }

    let rotated = 0

    for (const row of rows || []) {
      const decrypted = await decryptPayload(row.content_enc, {
        userId: row.user_id,
        patientId: row.patient_id,
        medicalRecordId: row.medical_record_id,
        resourceType: row.entry_type,
        resourceId: row.id
      })

      const reEncrypted = await encryptPayload(decrypted, {
        userId: row.user_id,
        patientId: row.patient_id,
        medicalRecordId: row.medical_record_id,
        resourceType: row.entry_type,
        resourceId: row.id
      })

      const { error: updateError } = await clinical
        .from('medical_record_entries')
        .update({
          content_enc: reEncrypted.enc,
          content_sha256: reEncrypted.sha,
          crypto_version: reEncrypted.version,
          updated_at: new Date().toISOString()
        })
        .eq('id', row.id)

      if (!updateError) {
        rotated += 1
      }
    }

    await clinical.from('medical_record_retention_events').insert({
      user_id: auth.userId,
      actor_user_id: auth.userId,
      event_type: 'key_rotation',
      policy_version: `v${activeVersion}`,
      details_redacted: {
        from_version: fromVersion,
        to_version: activeVersion,
        rotated
      }
    })

    await writeMedicalAudit({
      userId: auth.userId,
      actorUserId: auth.userId,
      resourceType: 'encryption',
      action: 'rotate_key',
      origin: 'rotate-medical-encryption-key',
      userAgent: req.headers.get('user-agent'),
      result: 'success',
      resultCode: `from_v${fromVersion}_to_v${activeVersion}`
    })

    return jsonResponse({ ok: true, dryRun: false, rotated, fromVersion, toVersion: activeVersion })
  } catch (error) {
    const message = String((error as Error)?.message || 'internal_error')
    if (message === 'missing_auth_token' || message === 'unauthorized') {
      return errorResponse('unauthorized', 401)
    }
    return errorResponse('failed_to_rotate_key', 500)
  }
})

