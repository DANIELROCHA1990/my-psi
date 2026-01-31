// Calendar.tsx

import React, { useState, useEffect } from 'react'
import { sessionService } from '../services/sessionService'
import { supabase } from '../lib/supabase'
import { Session } from '../types'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, User, Edit, ExternalLink } from 'lucide-react'
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { findSessionConflict } from '../lib/scheduling'
import { normalizeSearchText } from '../lib/search'

// Utilitario: Garante que todas as datas sejam interpretadas como UTC.
// Se a string já tem 'Z', parseISO a trata como UTC.
// Se não tem 'Z', mas sabemos que o backend envia UTC, podemos adicionar 'Z' para forçar a interpretação.
// No entanto, com a correção no SessionService, as datas do backend SEMPRE terão 'Z'.
// Então, parseISO(dateString) já é suficiente.
function parseUTC(dateString: string): Date {
  if (!dateString) return new Date();
  // Com o SessionService corrigido, as datas do Supabase virão com 'Z'.
  // parseISO() com 'Z' já interpreta como UTC.
  // Não precisamos mais remover ou adicionar 'Z' aqui, apenas parsear.
  return parseISO(dateString);
}

type AgendaPushResult = {
  patients: number
  tokens: number
  sent: number
  failed: number
  disabled: number
  dryRun?: boolean
}

function formatSessionTypeLabel(value?: string): string {
  if (!value) {
    return 'Sessao'
  }

  const normalized = normalizeSearchText(value)

  if (normalized.includes('individual')) {
    return 'Sessao Individual'
  }
  if (normalized.includes('grupo')) {
    return 'Sessao em Grupo'
  }
  if (normalized.includes('familiar')) {
    return 'Sessao Familiar'
  }
  if (normalized.includes('avaliacao')) {
    return 'Avaliacao'
  }
  if (normalized.includes('retorno')) {
    return 'Retorno'
  }
  if (normalized.includes('sess')) {
    return 'Sessao'
  }

  return value
}

function normalizeSessionLink(link?: string | null): string | null {
  if (!link) {
    return null
  }
  const trimmed = link.trim()
  if (!trimmed) {
    return null
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }
  return `https://${trimmed}`
}

function normalizeHexColorValue(value?: string | null): string | null {
  if (!value) {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`
  return withHash.toLowerCase()
}

function isValidHexColor(value: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(value)
}

function getReadableTextColor(hexColor: string): string {
  const raw = hexColor.replace('#', '')
  const expanded = raw.length === 3 ? raw.split('').map((char) => char + char).join('') : raw
  const r = parseInt(expanded.slice(0, 2), 16)
  const g = parseInt(expanded.slice(2, 4), 16)
  const b = parseInt(expanded.slice(4, 6), 16)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 160 ? '#1f2937' : '#f9fafb'
}

function SessionEditModal({
  session,
  allSessions,
  onClose,
  onSaved
}: {
  session: Session
  allSessions: Session[]
  onClose: () => void
  onSaved: (updatedSession: Session) => void
}) {
  const initialSessionDate = format(parseISO(session.session_date), "yyyy-MM-dd'T'HH:mm")
  const [formData, setFormData] = useState({
    session_date: initialSessionDate,
    duration_minutes: session.duration_minutes?.toString() || '50',
    session_type: session.session_type || 'Sessao Individual',
    session_price: session.session_price?.toString() || '',
    payment_status: session.payment_status || 'pending',
    summary: session.summary || ''
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!formData.session_date) {
      toast.error('Data e hora sao obrigatorias')
      return
    }

    const candidateStart = parseISO(formData.session_date)
    if (Number.isNaN(candidateStart.getTime())) {
      toast.error('Data invalida')
      return
    }

    const duration = formData.duration_minutes ? Number(formData.duration_minutes) : 50
    const conflict = findSessionConflict(allSessions, candidateStart, duration, {
      excludeSessionId: session.id
    })

    if (conflict) {
      const conflictName = conflict.patients?.full_name || 'paciente'
      toast.error(`Conflito com sessao de ${conflictName}`)
      return
    }

    const sessionDateChanged = formData.session_date !== initialSessionDate

    setSaving(true)

    try {
      if (sessionDateChanged) {
        await sessionService.rescheduleSession(session.id, formData.session_date)
      }

      const updates: Partial<Session> = {
        duration_minutes: formData.duration_minutes ? Number(formData.duration_minutes) : undefined,
        session_type: formData.session_type || undefined,
        session_price: formData.session_price ? Number(formData.session_price) : undefined,
        payment_status: formData.payment_status || 'pending',
        summary: formData.summary || undefined
      }

      const updatedSession = await sessionService.updateSession(session.id, updates)
      onSaved(updatedSession)
      toast.success('Sessao atualizada')
      onClose()
    } catch (error) {
      toast.error('Erro ao atualizar sessao')
    } finally {
      setSaving(false)
    }
  }

  const handleCancelSession = async () => {
    if (session.payment_status === 'cancelled') {
      toast.error('Sessao ja esta cancelada')
      return
    }

    if (!confirm('Tem certeza que deseja cancelar esta sessao?')) {
      return
    }

    setSaving(true)

    try {
      const updatedSession = await sessionService.updateSession(session.id, {
        payment_status: 'cancelled'
      })
      onSaved(updatedSession)
      toast.success('Sessao cancelada')
      onClose()
    } catch (error) {
      toast.error('Erro ao cancelar sessao')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Editar sessao</h2>
          <p className="text-sm text-gray-600 mt-1">{session.patients?.full_name}</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Data e hora
              </label>
              <input
                type="datetime-local"
                required
                value={formData.session_date}
                onChange={(event) => setFormData(prev => ({ ...prev, session_date: event.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Duracao (minutos)
              </label>
              <input
                type="number"
                min="1"
                value={formData.duration_minutes}
                onChange={(event) => setFormData(prev => ({ ...prev, duration_minutes: event.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tipo de sessao
              </label>
              <select
                value={formData.session_type}
                onChange={(event) => setFormData(prev => ({ ...prev, session_type: event.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="Sessao Individual">Sessao Individual</option>
                <option value="Sessao em Grupo">Sessao em Grupo</option>
                <option value="Sessao Familiar">Sessao Familiar</option>
                <option value="Avaliacao">Avaliacao</option>
                <option value="Retorno">Retorno</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Valor (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.session_price}
                onChange={(event) => setFormData(prev => ({ ...prev, session_price: event.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status do pagamento
              </label>
              <select
                value={formData.payment_status}
                onChange={(event) => setFormData(prev => ({ ...prev, payment_status: event.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="pending">Pendente</option>
                <option value="paid">Pago</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Resumo
            </label>
            <textarea
              rows={3}
              value={formData.summary}
              onChange={(event) => setFormData(prev => ({ ...prev, summary: event.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              placeholder="Resumo da sessao"
            />
          </div>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={handleCancelSession}
              disabled={saving}
              className="px-4 py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-60"
            >
              Cancelar sessao
            </button>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Voltar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-60"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}


export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date()) // currentDate é um objeto Date local
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedDate, setSelectedDate] = useState<Date | null>(null) // selectedDate é um objeto Date local
  const [selectedDateSessions, setSelectedDateSessions] = useState<Session[]>([])
  const [editingSession, setEditingSession] = useState<Session | null>(null)
  const [showAgendaEmailModal, setShowAgendaEmailModal] = useState(false)
  const [agendaEmailDate, setAgendaEmailDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [sendingAgendaEmail, setSendingAgendaEmail] = useState(false)
  const [showAgendaPushModal, setShowAgendaPushModal] = useState(false)
  const [agendaPushDate, setAgendaPushDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [sendingAgendaPush, setSendingAgendaPush] = useState(false)
  const [agendaPushResult, setAgendaPushResult] = useState<AgendaPushResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [currentDate])

  const loadData = async () => {
    try {
      setLoading(true)
      const sessionsData = await sessionService.getSessions()
      setSessions(sessionsData)
    } catch (error) {
      toast.error('Erro ao carregar dados do calendário')
    } finally {
      setLoading(false)
    }
  }

  const getSessionColor = (session: Session) => {
    const normalized = normalizeHexColorValue(session.patients?.calendar_color)
    if (!normalized || !isValidHexColor(normalized)) {
      return null
    }
    return normalized
  }

  const openAgendaEmailModal = () => {
    const baseDate = selectedDate || new Date()
    setAgendaEmailDate(format(baseDate, 'yyyy-MM-dd'))
    setShowAgendaEmailModal(true)
  }

  const openAgendaPushModal = () => {
    const baseDate = selectedDate || new Date()
    setAgendaPushDate(format(baseDate, 'yyyy-MM-dd'))
    setAgendaPushResult(null)
    setShowAgendaPushModal(true)
  }

  const handleSendAgendaEmail = async () => {
    if (!agendaEmailDate) {
      toast.error('Selecione uma data')
      return
    }

    const selectedAgendaDate = parseISO(agendaEmailDate)
    if (Number.isNaN(selectedAgendaDate.getTime())) {
      toast.error('Data invalida')
      return
    }

    const { data: sessionData } = await supabase.auth.getSession()
    let session = sessionData.session
    if (!session?.access_token) {
      await supabase.auth.refreshSession()
      const { data: refreshedData } = await supabase.auth.getSession()
      session = refreshedData.session
    }
    const accessToken = session?.access_token
    if (!accessToken) {
      toast.error('Sessao expirada. Faça login novamente.')
      return
    }
    console.log('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL)
    console.log('token prefix', accessToken.slice(0, 12))

    setSendingAgendaEmail(true)

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-agenda-email`
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ date: agendaEmailDate, accessToken })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`send-agenda-email HTTP ${response.status}: ${errorText}`)
      }

      toast.success('Agenda enviada para seu e-mail')
      setShowAgendaEmailModal(false)
    } catch (error) {
      console.error('Erro ao enviar agenda:', error)
      toast.error('Falha ao enviar agenda')
    } finally {
      setSendingAgendaEmail(false)
    }
  }

  const handleSendAgendaPush = async () => {
    if (!agendaPushDate) {
      toast.error('Selecione uma data')
      return
    }

    const selectedAgendaDate = parseISO(agendaPushDate)
    if (Number.isNaN(selectedAgendaDate.getTime())) {
      toast.error('Data invalida')
      return
    }

    const { data: sessionData } = await supabase.auth.getSession()
    let session = sessionData.session
    if (!session?.access_token) {
      await supabase.auth.refreshSession()
      const { data: refreshedData } = await supabase.auth.getSession()
      session = refreshedData.session
    }
    const accessToken = session?.access_token
    if (!accessToken) {
      toast.error('Sessao expirada. Faça login novamente.')
      return
    }

    setSendingAgendaPush(true)
    setAgendaPushResult(null)

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-agenda-push`
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ date: agendaPushDate, accessToken })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`send-agenda-push HTTP ${response.status}: ${errorText}`)
      }

      const result = (await response.json()) as { ok: boolean } & Partial<AgendaPushResult>
      if (result?.ok) {
        setAgendaPushResult({
          patients: result.patients ?? 0,
          tokens: result.tokens ?? 0,
          sent: result.sent ?? 0,
          failed: result.failed ?? 0,
          disabled: result.disabled ?? 0
        })
        toast.success('Notificacoes preparadas')
      } else {
        toast.error('Falha ao preparar notificacoes')
      }
    } catch (error) {
      console.error('Erro ao enviar push:', error)
      toast.error('Falha ao preparar notificacoes')
    } finally {
      setSendingAgendaPush(false)
    }
  }

  const monthStart = startOfMonth(currentDate) // currentDate e um objeto Date local
  const monthEnd = endOfMonth(currentDate)     // Objeto Date local
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const monthDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd }) // Array de objetos Date locais (meia-noite)

  const getSessionsForDate = (date: Date) => { // 'date' é um objeto Date local (meia-noite)
    return sessions.filter(session => {
      const sessionDateUTC = parseUTC(session.session_date) // sessionDateUTC é um objeto Date que representa a data/hora em UTC
      
      // Para comparar se a sessão cai no 'date' local, precisamos converter sessionDateUTC para o fuso horário local
      // e então comparar o dia.
      // isSameDay(date-fns) compara o dia, mês e ano de dois objetos Date, ignorando o tempo.
      // Se sessionDateUTC é 2023-10-25T12:00:00Z (9 AM local) e 'date' é 2023-10-25T00:00:00 (local),
      // isSameDay() funcionará corretamente.
      return isSameDay(sessionDateUTC, date) && session.payment_status !== 'cancelled'
    })
  }

  const getSessionsForDateFromList = (list: Session[], date: Date) => {
    return list.filter(session => {
      const sessionDateUTC = parseUTC(session.session_date)
      return isSameDay(sessionDateUTC, date) && session.payment_status !== 'cancelled'
    })
  }

  const handleDateClick = (date: Date) => {
    setSelectedDate(date)
    const dateSessions = getSessionsForDate(date)
    setSelectedDateSessions(dateSessions)
  }

  const handleSessionsUpdated = (updatedSessions: Session[]) => {
    if (!updatedSessions.length) {
      return
    }

    setSessions(prev => {
      const sessionMap = new Map(prev.map(session => [session.id, session]))
      updatedSessions.forEach(session => sessionMap.set(session.id, session))
      const nextSessions = Array.from(sessionMap.values())
      if (selectedDate) {
        setSelectedDateSessions(getSessionsForDateFromList(nextSessions, selectedDate))
      }
      return nextSessions
    })
  }


  const handlePreviousMonth = () => {
    setCurrentDate(subMonths(currentDate, 1))
  }

  const handleNextMonth = () => {
    setCurrentDate(addMonths(currentDate, 1))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Agenda</h1>
          <p className="text-gray-600 mt-2">Visualize e gerencie seus agendamentos.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={openAgendaPushModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
          >
            PREPARAR AGENDA
          </button>
          <button
            type="button"
            onClick={openAgendaEmailModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-emerald-600 text-emerald-700 hover:bg-emerald-50 transition-colors"
          >
            RECEBER AGENDA
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Calendar */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            {/* Calendar Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePreviousMonth}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={handleNextMonth}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Calendar Grid */}
            <div className="p-4 sm:p-6">
              {/* Days of week header */}
              <div className="grid grid-cols-7 gap-1 mb-4">
                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
                  <div key={day} className="p-1 sm:p-2 text-center text-[11px] sm:text-sm font-medium text-gray-600">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar days */}
              <div className="grid grid-cols-7 gap-1">
                {monthDays.map(day => {
                  const daySessions = getSessionsForDate(day)
                  const isSelected = selectedDate && isSameDay(day, selectedDate)
                  const isCurrentMonth = isSameMonth(day, currentDate)
                  
                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => handleDateClick(day)}
                      className={`
                        relative p-1 sm:p-2 h-16 sm:h-20 text-left border border-gray-100 hover:bg-gray-50 transition-colors
                        ${isSelected ? 'bg-emerald-50 border-emerald-200' : ''}
                        ${!isCurrentMonth ? 'text-gray-400' : ''}
                      `}
                    >
                      <span className={`text-xs sm:text-sm font-medium ${
                        isSameDay(day, new Date()) ? 'text-emerald-600' : ''
                      }`}>
                        {format(day, 'd')}
                      </span>
                      
                      {daySessions.length > 0 && (
                        <div className="mt-1 space-y-1">
                          {daySessions.slice(0, 2).map((session) => {
                            const patientColor = getSessionColor(session)
                            const chipStyle = patientColor
                              ? { backgroundColor: patientColor, color: getReadableTextColor(patientColor) }
                              : undefined
                            const chipClassName = patientColor
                              ? 'text-xs px-1 py-0.5 rounded truncate'
                              : `text-xs px-1 py-0.5 rounded truncate ${
                                  session.payment_status === 'paid' 
                                    ? 'bg-green-100 text-green-800'
                                    : session.payment_status === 'pending'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`

                            return (
                              <div
                                key={session.id}
                                className={chipClassName}
                                style={chipStyle}
                              >
                                {/* Formatar a hora da sessão, que é UTC, para o fuso horário local para exibição */}
                                {format(parseUTC(session.session_date), 'HH:mm')}
                              </div>
                            )
                          })}
                          {daySessions.length > 2 && (
                            <div className="text-xs text-gray-500">
                              +{daySessions.length - 2} mais
                            </div>
                          )}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Selected Date Sessions */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-gray-400" />
                <h3 className="text-lg font-semibold text-gray-900">
                  {selectedDate 
                    ? format(selectedDate, "dd 'de' MMMM", { locale: ptBR })
                    : 'Selecione uma data'
                  }
                </h3>
              </div>
            </div>
            
            <div className="p-6">
              {selectedDate ? (
                selectedDateSessions.length > 0 ? (
                  <div className="space-y-4">
                    {selectedDateSessions.map(session => {
                      const sessionLink = normalizeSessionLink(session.patients?.session_link)
                      const patientColor = getSessionColor(session)
                      return (
                      <div
                        key={session.id}
                        className={`border border-gray-200 rounded-lg p-4 ${patientColor ? 'border-l-4' : ''}`}
                        style={patientColor ? { borderLeftColor: patientColor } : undefined}
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {patientColor ? (
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: patientColor }}
                              />
                            ) : (
                              <User className="h-4 w-4 text-gray-400" />
                            )}
                            <span className="font-medium text-gray-900">
                              {session.patients?.full_name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              session.payment_status === 'paid' 
                                ? 'bg-green-100 text-green-800'
                                : session.payment_status === 'pending'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {session.payment_status === 'paid' ? 'Pago' : 
                               session.payment_status === 'pending' ? 'Pendente' : 'Cancelado'}
                            </span>
                            <button
                              type="button"
                              onClick={() => setEditingSession(session)}
                              className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                              title="Editar sessao"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 mb-2">
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {/* Formatar a hora da sessão, que é UTC, para o fuso horário local para exibição */}
                            {format(parseUTC(session.session_date), 'HH:mm')}
                          </div>
                          <span>{session.duration_minutes} min</span>
                        </div>
                        
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <span>{formatSessionTypeLabel(session.session_type)}</span>
                          {sessionLink && (
                            <a
                              href={sessionLink}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-600 hover:text-emerald-700"
                              title="Abrir link do atendimento"
                              aria-label="Abrir link do atendimento"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                        
                        {session.session_price && (
                          <div className="mt-2 text-sm font-medium text-gray-900">
                            R$ {Number(session.session_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </div>
                        )}
                      </div>
                    )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <CalendarIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">Nenhuma sessão agendada para este dia</p>
                  </div>
                )
              ) : (
                <div className="text-center py-8">
                  <CalendarIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">Clique em uma data para ver os agendamentos</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {editingSession && (
        <SessionEditModal
          session={editingSession}
          allSessions={sessions}
          onClose={() => setEditingSession(null)}
          onSaved={(updatedSession) => {
            handleSessionsUpdated([updatedSession])
            setEditingSession(null)
          }}
        />
      )}

      {showAgendaPushModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Preparar agenda (Push)</h2>
              <p className="text-sm text-gray-600 mt-1">
                Envie notificacoes para pacientes com consultas na data escolhida.
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Data
                </label>
                <input
                  type="date"
                  value={agendaPushDate}
                  onChange={(event) => setAgendaPushDate(event.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              {agendaPushDate && (
                <div className="text-sm text-gray-600">
                  {getSessionsForDate(parseISO(agendaPushDate)).length} sessoes encontradas para esta data.
                </div>
              )}
              {agendaPushResult && (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-700 space-y-1">
                  <div>{agendaPushResult.patients} pacientes com consulta.</div>
                  <div>{agendaPushResult.tokens} tokens ativos.</div>
                  <div>{agendaPushResult.sent} envios OK.</div>
                  <div>{agendaPushResult.failed} falhas.</div>
                  <div>{agendaPushResult.disabled} tokens desativados.</div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setShowAgendaPushModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={handleSendAgendaPush}
                disabled={sendingAgendaPush}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {sendingAgendaPush ? 'Preparando...' : 'Preparar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAgendaEmailModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Receber agenda por e-mail</h2>
              <p className="text-sm text-gray-600 mt-1">
                Escolha a data para receber todas as sessões por e-mail.
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Data
                </label>
                <input
                  type="date"
                  value={agendaEmailDate}
                  onChange={(event) => setAgendaEmailDate(event.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              {agendaEmailDate && (
                <div className="text-sm text-gray-600">
                  {getSessionsForDate(parseISO(agendaEmailDate)).length} sessões encontradas para esta data.
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setShowAgendaEmailModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSendAgendaEmail}
                disabled={sendingAgendaEmail}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {sendingAgendaEmail ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}




