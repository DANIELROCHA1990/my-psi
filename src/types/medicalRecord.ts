export type MedicalEntryType =
  | 'anamnesis'
  | 'objective_exam'
  | 'evolution'
  | 'prescription'
  | 'document'
  | 'exam_request'
  | 'referral'
  | 'active_problem'
  | 'intervention'
  | 'alert'
  | 'attachment'
  | 'note'

export interface PatientClinicalStatusRow {
  patient_id: string
  medical_record_id: string | null
  has_record: boolean
  has_pending_evolution: boolean
  has_pending_document: boolean
  alert_level: number
  last_evolution_at: string | null
  last_entry_at: string | null
  updated_at: string
  patient: {
    id: string
    full_name: string
    active: boolean
  } | null
}

export interface MedicalRecordSummary {
  id: string
  patient_id: string
  user_id: string
  record_status: 'active' | 'locked' | 'archived'
  opened_at: string
  closed_at?: string | null
  last_entry_at?: string | null
  has_pending_evolution: boolean
  has_pending_document: boolean
  alert_level: number
  updated_at?: string
}

export interface MedicalRecordEntry {
  id: string
  entry_type: MedicalEntryType
  event_at: string
  title_redacted?: string | null
  source_session_id?: string | null
  payload: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

export interface MedicalRecordAuditEvent {
  id: string
  resource_type: string
  resource_id?: string | null
  action: string
  purpose?: string | null
  origin?: string | null
  result: 'success' | 'denied' | 'error'
  result_code?: string | null
  created_at: string
}

export interface MedicalRecordChangeEvent {
  id: string
  resource_type: string
  resource_id: string
  action: string
  before_checksum?: string | null
  after_checksum?: string | null
  change_summary_redacted?: string | null
  created_at: string
}
