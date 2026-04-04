/// <reference path="../deno.d.ts" />
import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'
import { getBearerToken, requireAuth } from '../_shared/auth.ts'
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

    const resourceType = typeof body?.resourceType === 'string' ? body.resourceType : 'medical_record'
    const action = typeof body?.action === 'string' ? body.action : 'custom'

    await writeMedicalAudit({
      userId: auth.userId,
      actorUserId: auth.userId,
      patientId: typeof body?.patientId === 'string' ? body.patientId : null,
      medicalRecordId: typeof body?.medicalRecordId === 'string' ? body.medicalRecordId : null,
      resourceType,
      resourceId: typeof body?.resourceId === 'string' ? body.resourceId : null,
      action,
      purpose: typeof body?.purpose === 'string' ? body.purpose : null,
      origin: 'audit-medical-access',
      userAgent: req.headers.get('user-agent'),
      result: body?.result === 'denied' ? 'denied' : body?.result === 'error' ? 'error' : 'success',
      resultCode: typeof body?.resultCode === 'string' ? body.resultCode : null
    })

    return jsonResponse({ ok: true })
  } catch (error) {
    const message = String((error as Error)?.message || 'internal_error')
    if (message === 'missing_auth_token' || message === 'unauthorized') {
      return errorResponse('unauthorized', 401)
    }
    return errorResponse('failed_to_write_audit', 500)
  }
})

