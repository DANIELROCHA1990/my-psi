export interface User {
  id: string
  email: string
  created_at?: string
  updated_at?: string
}

export interface Profile {
  id: string
  user_id: string
  full_name: string
  specialty?: string
  crp_number?: string
  signature_data?: string | null
  logo_data?: string | null
  phone?: string
  email?: string
  address?: string
  city?: string
  state?: string
  zip_code?: string
  session_price?: number
  created_at?: string
  updated_at?: string
}

export interface Patient {
  id: string
  user_id: string
  full_name: string
  email?: string
  phone?: string
  address?: string
  created_at?: string
  birth_date?: string
  cpf?: string
  city?: string
  state?: string
  zip_code?: string
  emergency_contact?: string
  emergency_phone?: string
  medical_history?: string
  current_medications?: string
  therapy_goals?: string
  session_frequency: string
  session_price?: number
  session_link?: string | null
  meet_event_id?: string | null
  meet_calendar_id?: string | null
  calendar_color?: string | null
  auto_renew_sessions?: boolean
  session_schedules?: SessionSchedule[]
  active: boolean
  is_temp?: boolean
  updated_at?: string
}

export interface SessionSchedule {
  dayOfWeek: number // 0 = domingo, 1 = segunda, etc.
  time: string // formato HH:mm
  startDate?: string // formato yyyy-MM-dd para a primeira sessão
  paymentStatus: 'paid' | 'pending'
  sessionType?: string
  durationMinutes?: number
  sessionPrice?: number
}

export interface Session {
  id: string
  patient_id: string
  session_date: string
  summary?: string
  created_at?: string
  user_id: string
  duration_minutes?: number
  session_type?: string
  session_notes?: string
  mood_before?: string
  mood_after?: string
  homework_assigned?: string
  next_session_date?: string
  session_price?: number
  payment_status?: string
  updated_at?: string
  patients?: Patient
}

export interface FinancialRecord {
  id: string
  patient_id: string
  amount: number
  transaction_date: string
  description?: string
  created_at?: string
  user_id: string
  transaction_type: 'income' | 'expense'
  category?: string
  session_id?: string
  payment_method: string
  patients?: Patient
  sessions?: Session
}

