import { supabase } from '../lib/supabase'
import {
  MedicalEntryType,
  MedicalRecordAuditEvent,
  MedicalRecordChangeEvent,
  MedicalRecordEntry,
  MedicalRecordSummary,
  PatientClinicalStatusRow
} from '../types/medicalRecord'

const getAccessToken = async () => {
  const { data: sessionData } = await supabase.auth.getSession()
  let session = sessionData.session
  const now = Math.floor(Date.now() / 1000)

  if (!session || (session.expires_at && session.expires_at - now < 60)) {
    const { data: refreshedData, error } = await supabase.auth.refreshSession()
    if (error || !refreshedData.session) {
      throw new Error('Sessão expirada. Faça login novamente.')
    }
    session = refreshedData.session
  }

  if (!session?.access_token) {
    throw new Error('Sessão inválida')
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(session.access_token)
  if (userError || !userData?.user?.id) {
    const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession()
    if (refreshError || !refreshedData.session?.access_token) {
      throw new Error('Sessão expirada. Faça login novamente.')
    }
    session = refreshedData.session
  }

  return session.access_token
}

const invokeWithToken = async <T>(name: string, body: Record<string, unknown>, accessToken: string): Promise<T> => {
  const { data, error } = await supabase.functions.invoke(name, {
    body,
    headers: { Authorization: `Bearer ${accessToken}` }
  })

  if (error) {
    const status = (error as any)?.context?.status || (error as any)?.status
    if (status === 401) {
      await supabase.auth.signOut()
      throw new Error('Sessão expirada. Faça login novamente.')
    }

    let backendMessage = ''
    const responseLike = (error as any)?.context
    if (responseLike && typeof responseLike?.clone === 'function') {
      try {
        const payload = await responseLike.clone().json()
        if (typeof payload?.error === 'string') {
          backendMessage = payload.error
        } else if (typeof payload?.code === 'string') {
          backendMessage = payload.code
        }
      } catch (_ignored) {
        backendMessage = ''
      }
    }

    throw new Error(backendMessage || error.message || 'Falha na operação')
  }

  return data as T
}

const invoke = async <T>(name: string, body: Record<string, unknown>): Promise<T> => {
  const accessToken = await getAccessToken()
  return invokeWithToken<T>(name, body, accessToken)
}

export const medicalRecordService = {
  async listDerivedStatus(patientId?: string) {
    const data = await invoke<{ ok: boolean; rows: PatientClinicalStatusRow[] }>('list-medical-derived-status', {
      patientId: patientId || null
    })
    return data.rows || []
  },

  async createOrGetRecord(patientId: string, purpose = 'clinical_access') {
    const data = await invoke<{ ok: boolean; record: MedicalRecordSummary }>('create-medical-record', {
      patientId,
      purpose
    })
    return data.record
  },

  async getRecord(params: { patientId?: string; medicalRecordId?: string; purpose?: string; limit?: number }) {
    const data = await invoke<{
      ok: boolean
      record: MedicalRecordSummary
      entries: MedicalRecordEntry[]
      auditTrail: MedicalRecordAuditEvent[]
      changeHistory: MedicalRecordChangeEvent[]
    }>('get-medical-record', {
      patientId: params.patientId || null,
      medicalRecordId: params.medicalRecordId || null,
      purpose: params.purpose || 'clinical_access',
      limit: params.limit || 100,
      includeEntries: true
    })

    return data
  },

  async createEntry(input: {
    patientId: string
    entryType: MedicalEntryType
    payload: Record<string, unknown>
    sourceSessionId?: string
    titleRedacted?: string
    eventAt?: string
    purpose?: string
  }) {
    return invoke<{ ok: boolean; entryId: string; medicalRecordId: string }>('create-medical-entry', {
      patientId: input.patientId,
      entryType: input.entryType,
      payload: input.payload,
      sourceSessionId: input.sourceSessionId || null,
      titleRedacted: input.titleRedacted || null,
      eventAt: input.eventAt || null,
      purpose: input.purpose || 'clinical_write'
    })
  },

  async updateEntry(input: {
    entryId: string
    payload: Record<string, unknown>
    titleRedacted?: string
    purpose?: string
  }) {
    return invoke<{ ok: boolean; entryId: string }>('update-medical-entry', {
      entryId: input.entryId,
      payload: input.payload,
      titleRedacted: input.titleRedacted || null,
      purpose: input.purpose || 'clinical_update'
    })
  },

  async exportRecord(patientId: string, purpose = 'clinical_export') {
    return invoke<{ ok: boolean; path: string; signedUrl: string | null; expiresIn: number }>('export-medical-record', {
      patientId,
      purpose
    })
  },

  async generatePdf(patientId: string, title?: string, purpose = 'clinical_document') {
    return invoke<{ ok: boolean; documentId: string; signedUrl: string | null; expiresIn: number }>('generate-medical-document-pdf', {
      patientId,
      title: title || 'Documento clínico',
      purpose
    })
  },

  async createAttachmentUploadUrl(input: {
    patientId: string
    fileName: string
    mimeType: string
    sizeBytes: number
    purpose?: string
  }) {
    return invoke<{
      ok: boolean
      attachmentId: string
      signedUrl: string
      token: string
      path: string
      bucket: string
    }>('upload-medical-attachment-url', {
      patientId: input.patientId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      purpose: input.purpose || 'clinical_attachment_upload'
    })
  },

  async getAttachmentUrl(attachmentId: string, purpose = 'clinical_attachment_download') {
    return invoke<{ ok: boolean; signedUrl: string; expiresIn: number }>('get-medical-attachment-url', {
      attachmentId,
      purpose
    })
  },

  async migrateLegacy(dryRun = true, clearLegacy = false) {
    return invoke<{
      ok: boolean
      dryRun: boolean
      clearLegacy: boolean
      migratedPatients: number
      migratedSessionEntries: number
    }>('migrate-legacy-clinical-fields', {
      dryRun,
      clearLegacy
    })
  },

  async auditAccess(input: {
    patientId?: string
    medicalRecordId?: string
    resourceType?: string
    resourceId?: string
    action: string
    purpose?: string
    result?: 'success' | 'denied' | 'error'
    resultCode?: string
  }) {
    return invoke<{ ok: boolean }>('audit-medical-access', {
      patientId: input.patientId || null,
      medicalRecordId: input.medicalRecordId || null,
      resourceType: input.resourceType || 'medical_record',
      resourceId: input.resourceId || null,
      action: input.action,
      purpose: input.purpose || null,
      result: input.result || 'success',
      resultCode: input.resultCode || null
    })
  }
}

