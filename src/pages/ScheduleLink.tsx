import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Calendar as CalendarIcon, Clock, Copy, CheckCircle } from 'lucide-react'
import { addMinutes, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { DEFAULT_SESSION_DURATION_MINUTES, findSessionConflict } from '../lib/scheduling'

const SLOT_INTERVAL_MINUTES = 60
const WORKDAY_START_HOUR = 8
const WORKDAY_END_HOUR = 20

type AvailabilitySession = {
  id: string
  session_date: string
  duration_minutes: number | null
  payment_status: string | null
}

const getTimezoneOffsetString = () => {
  const offsetMinutes = -new Date().getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMinutes)
  const hours = String(Math.floor(abs / 60)).padStart(2, '0')
  const minutes = String(abs % 60).padStart(2, '0')
  return `${sign}${hours}:${minutes}`
}

const buildSlotsForDate = (dateString: string) => {
  const base = new Date(`${dateString}T00:00:00`)
  const start = new Date(base)
  start.setHours(WORKDAY_START_HOUR, 0, 0, 0)
  const end = new Date(base)
  end.setHours(WORKDAY_END_HOUR, 0, 0, 0)

  const slots: Date[] = []
  let cursor = new Date(start)

  while (cursor <= end) {
    const endSlot = addMinutes(cursor, DEFAULT_SESSION_DURATION_MINUTES)
    if (endSlot <= end) {
      slots.push(new Date(cursor))
    }
    cursor = addMinutes(cursor, SLOT_INTERVAL_MINUTES)
  }

  return slots
}

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const normalizeSupabaseUrl = (value: string) =>
  value.replace(/\/(rest|functions)\/v1\/?$/i, '').replace(/\/+$/, '')

const supabaseUrl = rawSupabaseUrl ? normalizeSupabaseUrl(rawSupabaseUrl) : ''

const callPublicSchedule = async (payload: Record<string, unknown>) => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase nao configurado')
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/public-schedule`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`
    },
    body: JSON.stringify(payload)
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.error || `Erro ao processar (${response.status})`)
  }
  if (!data?.ok) {
    throw new Error(data?.error || 'Falha ao processar')
  }
  return data
}

export default function ScheduleLink() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const tokenParam = (searchParams.get('token') || '').trim()
  const [linkToken, setLinkToken] = useState<string>('')
  const [loadingLink, setLoadingLink] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)
  const [formData, setFormData] = useState({
    full_name: '',
    cpf: '',
    phone: '',
    email: '',
    emergency_contact: '',
    session_frequency: 'weekly'
  })
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')
  const [availabilitySessions, setAvailabilitySessions] = useState<AvailabilitySession[]>([])
  const [availableSlots, setAvailableSlots] = useState<Date[]>([])
  const [loadingAvailability, setLoadingAvailability] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const activeToken = tokenParam || linkToken

  useEffect(() => {
    if (tokenParam || !user) {
      return
    }

    const loadToken = async () => {
      try {
        setLoadingLink(true)
        const { data, error } = await supabase
          .from('public_schedule_links')
          .select('token')
          .eq('user_id', user.id)
          .is('revoked_at', null)
          .order('created_at', { ascending: false })
          .limit(1)

        if (error) throw error

        if (data && data.length > 0) {
          setLinkToken(data[0].token)
          return
        }

        const newToken = crypto.randomUUID().replace(/-/g, '')
        const { data: created, error: insertError } = await supabase
          .from('public_schedule_links')
          .insert({ user_id: user.id, token: newToken })
          .select('token')
          .single()

        if (insertError) throw insertError

        setLinkToken(created?.token || newToken)
      } catch (error) {
        console.error('Erro ao carregar link de agendamento:', error)
        toast.error('Falha ao gerar link de agendamento')
      } finally {
        setLoadingLink(false)
      }
    }

    loadToken()
  }, [tokenParam, user])

  useEffect(() => {
    if (!activeToken || !selectedDate) {
      setAvailabilitySessions([])
      setAvailableSlots([])
      return
    }

    const loadAvailability = async () => {
      try {
        setLoadingAvailability(true)
        const data = await callPublicSchedule({
          action: 'availability',
          token: activeToken,
          date: selectedDate,
          timezone: getTimezoneOffsetString()
        })

        const sessions = (data.sessions || []) as AvailabilitySession[]
        setAvailabilitySessions(sessions)
      } catch (error: any) {
        console.error('Erro ao buscar disponibilidade:', error)
        toast.error(error?.message || 'Erro ao carregar horarios')
        setAvailabilitySessions([])
      } finally {
        setLoadingAvailability(false)
      }
    }

    loadAvailability()
  }, [activeToken, selectedDate])

  useEffect(() => {
    if (!selectedDate) {
      setAvailableSlots([])
      return
    }

    const slots = buildSlotsForDate(selectedDate)
    const now = new Date()
    const available = slots.filter((slot) => {
      if (slot <= now) {
        return false
      }
      const conflict = findSessionConflict(availabilitySessions as any, slot)
      return !conflict
    })

    setAvailableSlots(available)
    setSelectedTime((current) => {
      if (!current) return ''
      const stillAvailable = available.some((slot) => format(slot, 'HH:mm') === current)
      return stillAvailable ? current : ''
    })
  }, [availabilitySessions, selectedDate])

  const shareLink = useMemo(() => {
    if (!activeToken || typeof window === 'undefined') {
      return ''
    }
    return `${window.location.origin}/link-de-agendamento?token=${activeToken}`
  }, [activeToken])

  const copyShareLink = async () => {
    if (!shareLink) return
    try {
      await navigator.clipboard.writeText(shareLink)
      toast.success('Link copiado')
    } catch (error) {
      toast.error('Falha ao copiar link')
    }
  }

  const handleNext = () => {
    if (!formData.full_name.trim()) {
      toast.error('Informe o nome completo')
      return
    }
    if (!formData.cpf.trim()) {
      toast.error('Informe o CPF')
      return
    }
    if (!formData.phone.trim()) {
      toast.error('Informe o telefone/WhatsApp')
      return
    }
    if (!formData.emergency_contact.trim()) {
      toast.error('Informe o contato de emergencia')
      return
    }

    setStep(2)
  }

  const handleSubmit = async () => {
    if (!selectedDate) {
      toast.error('Selecione um dia')
      return
    }
    if (!selectedTime) {
      toast.error('Selecione um horario')
      return
    }
    if (!activeToken) {
      toast.error('Link invalido')
      return
    }

    setSubmitting(true)
    try {
      await callPublicSchedule({
        action: 'book',
        token: activeToken,
        date: selectedDate,
        time: selectedTime,
        timezone: getTimezoneOffsetString(),
        patient: formData
      })

      setDone(true)
      toast.success('Agendamento solicitado')
    } catch (error: any) {
      console.error('Erro ao agendar:', error)
      toast.error(error.message || 'Erro ao agendar')
    } finally {
      setSubmitting(false)
    }
  }

  if (!activeToken && !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 max-w-lg w-full text-center">
          <CalendarIcon className="h-10 w-10 text-emerald-600 mx-auto" />
          <h1 className="text-xl font-semibold text-gray-900 mt-4">Link de agendamento invalido</h1>
          <p className="text-gray-600 mt-2">
            Solicite um link valido ao profissional responsavel.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl space-y-6">
        {!tokenParam && user && (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900">Link de agendamento</h2>
            <p className="text-sm text-gray-600 mt-1">
              Compartilhe este link com seu paciente para ele preencher os dados e escolher o horario.
            </p>
            <div className="mt-4 flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                readOnly
                value={loadingLink ? 'Gerando link...' : shareLink}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <button
                type="button"
                onClick={copyShareLink}
                disabled={loadingLink || !shareLink}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <Copy className="h-4 w-4" />
                Copiar
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-xl border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h1 className="text-2xl font-semibold text-gray-900">Agendamento</h1>
            <p className="text-sm text-gray-600 mt-1">Preencha os dados e escolha o melhor horario.</p>
          </div>

          {done ? (
            <div className="p-10 text-center">
              <CheckCircle className="h-12 w-12 text-emerald-600 mx-auto" />
              <h2 className="text-xl font-semibold text-gray-900 mt-4">Agendamento enviado</h2>
              <p className="text-gray-600 mt-2">
                Seu horario foi reservado. Aguarde a confirmacao do profissional.
              </p>
            </div>
          ) : (
            <div className="p-6">
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
                <span className={`px-2 py-1 rounded-full ${step === 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100'}`}>
                  1. Dados
                </span>
                <span className={`px-2 py-1 rounded-full ${step === 2 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100'}`}>
                  2. Dia e horario
                </span>
              </div>

              {step === 1 ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo *</label>
                    <input
                      type="text"
                      value={formData.full_name}
                      onChange={(e) => setFormData((prev) => ({ ...prev, full_name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">CPF *</label>
                      <input
                        type="text"
                        value={formData.cpf}
                        onChange={(e) => setFormData((prev) => ({ ...prev, cpf: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="000.000.000-00"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Telefone/WhatsApp *</label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Contato de emergencia *</label>
                      <input
                        type="text"
                        value={formData.emergency_contact}
                        onChange={(e) => setFormData((prev) => ({ ...prev, emergency_contact: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Frequencia das sessoes *</label>
                    <select
                      value={formData.session_frequency}
                      onChange={(e) => setFormData((prev) => ({ ...prev, session_frequency: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="weekly">Semanal</option>
                      <option value="as_needed">Conforme necessario</option>
                    </select>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleNext}
                      className="px-6 py-2 bg-emerald-600 text-white rounded-lg"
                    >
                      Seguinte
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Escolha o dia</label>
                    <div className="relative">
                      <CalendarIcon className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        min={format(new Date(), 'yyyy-MM-dd')}
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Escolha o horario</label>
                    {loadingAvailability ? (
                      <p className="text-sm text-gray-500">Carregando horarios...</p>
                    ) : selectedDate ? (
                      availableSlots.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {availableSlots.map((slot) => {
                            const label = format(slot, 'HH:mm', { locale: ptBR })
                            const active = selectedTime === label
                            return (
                              <button
                                key={slot.toISOString()}
                                type="button"
                                onClick={() => setSelectedTime(label)}
                                className={`px-3 py-2 rounded-lg border text-sm flex items-center justify-center gap-2 ${
                                  active
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-300'
                                }`}
                              >
                                <Clock className="h-4 w-4" />
                                {label}
                              </button>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">Sem horarios disponiveis para este dia.</p>
                      )
                    ) : (
                      <p className="text-sm text-gray-500">Selecione um dia para ver os horarios.</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="px-4 py-2 text-gray-600 hover:text-gray-800"
                    >
                      Voltar
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="px-6 py-2 bg-emerald-600 text-white rounded-lg disabled:opacity-60"
                    >
                      {submitting ? 'Enviando...' : 'Finalizar'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
