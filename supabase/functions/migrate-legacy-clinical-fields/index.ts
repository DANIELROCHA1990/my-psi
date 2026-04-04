/// <reference path="../deno.d.ts" />
import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'
import { getBearerToken, requireAuth } from '../_shared/auth.ts'
import { ensureMedicalRecord, refreshClinicalStatus } from '../_shared/medical.ts'
import { encryptPayload } from '../_shared/crypto.ts'
import { writeMedicalAudit, writeMedicalChange } from '../_shared/audit.ts'
import { getAdminClient } from '../_shared/supabase.ts'

const hasText = (value: unknown) => typeof value === 'string' && value.trim().length > 0

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
    const patientIdFilter = typeof body?.patientId === 'string' ? body.patientId.trim() : ''
    const dryRun = body?.dryRun !== false
    const clearLegacy = body?.clearLegacy === true
    const limitPatients = Math.min(Math.max(Number(body?.limitPatients || 100), 1), 500)

    const admin = getAdminClient()
    let patientQuery = admin
      .from('patients')
      .select('id,user_id,medical_history,current_medications,therapy_goals')
      .eq('user_id', auth.userId)
      .limit(limitPatients)

    if (patientIdFilter) {
      patientQuery = patientQuery.eq('id', patientIdFilter)
    }

    const { data: patients, error: patientsError } = await patientQuery
    if (patientsError) {
      throw new Error('patients_query_failed')
    }

    let migratedPatients = 0
    let migratedSessionEntries = 0

    for (const patient of patients || []) {
      const hasPatientSensitive = hasText(patient.medical_history) || hasText(patient.current_medications) || hasText(patient.therapy_goals)

      const { data: sessions, error: sessionsError } = await admin
        .from('sessions')
        .select('id,session_date,session_notes,summary,mood_before,mood_after,homework_assigned')
        .eq('user_id', auth.userId)
        .eq('patient_id', patient.id)
        .order('session_date', { ascending: true })

      if (sessionsError) {
        throw new Error('sessions_query_failed')
      }

      const relevantSessions = (sessions || []).filter((session) =>
        hasText(session.session_notes) ||
        hasText(session.summary) ||
        hasText(session.mood_before) ||
        hasText(session.mood_after) ||
        hasText(session.homework_assigned)
      )

      if (!hasPatientSensitive && relevantSessions.length === 0) {
        continue
      }

      const record = await ensureMedicalRecord(auth.userId, patient.id)

      if (!dryRun && hasPatientSensitive) {
        const entryId = crypto.randomUUID()
        const payload = {
          migratedFrom: 'patients',
          medical_history: patient.medical_history || null,
          current_medications: patient.current_medications || null,
          therapy_goals: patient.therapy_goals || null,
          migrated_at: new Date().toISOString()
        }

        const encrypted = await encryptPayload(payload, {
          userId: auth.userId,
          patientId: patient.id,
          medicalRecordId: record.id,
          resourceType: 'anamnesis',
          resourceId: entryId
        })

        await admin.schema('clinical').from('medical_record_entries').insert({
          id: entryId,
          medical_record_id: record.id,
          user_id: auth.userId,
          patient_id: patient.id,
          entry_type: 'anamnesis',
          event_at: new Date().toISOString(),
          title_redacted: 'Migra��o de dados cl�nicos legados',
          content_enc: encrypted.enc,
          content_sha256: encrypted.sha,
          crypto_version: encrypted.version,
          has_sensitive_content: true,
          created_by: auth.userId,
          updated_by: auth.userId
        })

        await admin.schema('clinical').from('medical_record_anamnesis').insert({
          medical_record_id: record.id,
          entry_id: entryId,
          user_id: auth.userId,
          patient_id: patient.id,
          recorded_at: new Date().toISOString(),
          anamnesis_text_enc: encrypted.enc,
          payload_sha256: encrypted.sha,
          crypto_version: encrypted.version,
          created_by: auth.userId,
          updated_by: auth.userId
        })

        await writeMedicalChange({
          userId: auth.userId,
          actorUserId: auth.userId,
          patientId: patient.id,
          medicalRecordId: record.id,
          resourceType: 'medical_record_entry',
          resourceId: entryId,
          action: 'migrate_legacy_patient_fields',
          afterChecksum: encrypted.sha,
          changeSummaryRedacted: 'legacy_patient_fields_migrated',
          cryptoVersion: encrypted.version
        })
      }

      for (const session of relevantSessions) {
        if (!dryRun) {
          const entryId = crypto.randomUUID()
          const payload = {
            migratedFrom: 'sessions',
            session_id: session.id,
            session_date: session.session_date,
            session_notes: session.session_notes || null,
            summary: session.summary || null,
            mood_before: session.mood_before || null,
            mood_after: session.mood_after || null,
            homework_assigned: session.homework_assigned || null,
            migrated_at: new Date().toISOString()
          }

          const encrypted = await encryptPayload(payload, {
            userId: auth.userId,
            patientId: patient.id,
            medicalRecordId: record.id,
            resourceType: 'evolution',
            resourceId: entryId
          })

          await admin.schema('clinical').from('medical_record_entries').insert({
            id: entryId,
            medical_record_id: record.id,
            user_id: auth.userId,
            patient_id: patient.id,
            entry_type: 'evolution',
            source_session_id: session.id,
            event_at: session.session_date,
            title_redacted: 'Migra��o de evolu��o cl�nica legada',
            content_enc: encrypted.enc,
            content_sha256: encrypted.sha,
            crypto_version: encrypted.version,
            has_sensitive_content: true,
            created_by: auth.userId,
            updated_by: auth.userId
          })

          await admin.schema('clinical').from('medical_record_evolutions').insert({
            medical_record_id: record.id,
            entry_id: entryId,
            session_id: session.id,
            user_id: auth.userId,
            patient_id: patient.id,
            evolution_date: session.session_date,
            is_pending: false,
            evolution_text_enc: encrypted.enc,
            payload_sha256: encrypted.sha,
            crypto_version: encrypted.version,
            created_by: auth.userId,
            updated_by: auth.userId
          })

          await admin
            .from('sessions')
            .update({
              has_clinical_entry: true,
              clinical_entry_id: entryId,
              clinical_last_updated_at: new Date().toISOString(),
              requires_clinical_evolution: false,
              operational_summary: 'Registro cl�nico migrado para prontu�rio'
            })
            .eq('id', session.id)
            .eq('user_id', auth.userId)

          if (clearLegacy) {
            await admin
              .from('sessions')
              .update({
                session_notes: null,
                summary: null,
                mood_before: null,
                mood_after: null,
                homework_assigned: null
              })
              .eq('id', session.id)
              .eq('user_id', auth.userId)
          }
        }

        migratedSessionEntries += 1
      }

      if (!dryRun && clearLegacy && hasPatientSensitive) {
        await admin
          .from('patients')
          .update({
            medical_history: null,
            current_medications: null,
            therapy_goals: null
          })
          .eq('id', patient.id)
          .eq('user_id', auth.userId)
      }

      if (!dryRun) {
        await refreshClinicalStatus(auth.userId, patient.id)
      }

      migratedPatients += 1
    }

    await writeMedicalAudit({
      userId: auth.userId,
      actorUserId: auth.userId,
      resourceType: 'migration',
      action: 'migrate_legacy_clinical_fields',
      origin: 'migrate-legacy-clinical-fields',
      userAgent: req.headers.get('user-agent'),
      result: 'success',
      resultCode: `patients:${migratedPatients};sessions:${migratedSessionEntries};dryRun:${dryRun}`
    })

    return jsonResponse({
      ok: true,
      dryRun,
      clearLegacy,
      migratedPatients,
      migratedSessionEntries
    })
  } catch (error) {
    const message = String((error as Error)?.message || 'internal_error')
    if (message === 'missing_auth_token' || message === 'unauthorized') {
      return errorResponse('unauthorized', 401)
    }
    return errorResponse('failed_to_migrate_legacy_fields', 500)
  }
})

