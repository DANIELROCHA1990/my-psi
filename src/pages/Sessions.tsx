import React, { useState, useEffect, useMemo } from 'react'
import { sessionService } from '../services/sessionService'
import { patientService } from '../services/patientService'
import { Session, Patient } from '../types'
import { Plus, Search, Edit, Calendar, Clock, DollarSign, FileText, CalendarClock, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { findSessionConflict } from '../lib/scheduling'
import { normalizeSearchText } from '../lib/search'

type PaymentStatus = 'paid' | 'pending' | 'cancelled'

type MonthGroup = {
  key: string
  label: string
  start: Date
  sessions: Session[]
  totalAmount: number
  totalSessions: number
  paidCount: number
  pendingCount: number
  cancelledCount: number
  patientsCount: number
}

export default function Sessions() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingSession, setEditingSession] = useState<Session | null>(null)
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [sessionsData, patientsData] = await Promise.all([
        sessionService.getSessions(),
        patientService.getPatients()
      ])
      setSessions(sessionsData)
      setPatients(patientsData)
    } catch (error) {
      toast.error('Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }
  const handleCancelSession = async (session: Session) => {
    if (session.payment_status === 'cancelled') {
      toast.error('Sessao ja esta cancelada')
      return
    }

    if (!confirm('Tem certeza que deseja cancelar esta sessao?')) return

    try {
      const updatedSession = await sessionService.updateSession(session.id, {
        payment_status: 'cancelled'
      })
      handleSessionsUpdated([updatedSession])
      toast.success('Sessao cancelada com sucesso')
    } catch (error) {
      toast.error('Erro ao cancelar sessao')
    }
  }

  const stats = {
    total: sessions.length,
    upcoming: sessions.filter(s => parseISO(s.session_date) > new Date()).length,
    completed: sessions.filter(s => parseISO(s.session_date) < new Date()).length,
    paid: sessions.filter(s => s.payment_status === 'paid').length
  }

  const patientNameById = useMemo(() => {
    return new Map(patients.map(patient => [patient.id, patient.full_name]))
  }, [patients])

  const getPatientName = (patientId: string, fallback?: string) => {
    return fallback || patientNameById.get(patientId) || 'Paciente'
  }

  const monthGroups = useMemo<MonthGroup[]>(() => {
    const groups = new Map<string, {
      key: string
      label: string
      start: Date
      sessions: Session[]
      totalAmount: number
      paidCount: number
      pendingCount: number
      cancelledCount: number
      patientIds: Set<string>
    }>()

    sessions.forEach(session => {
      const sessionDate = parseISO(session.session_date)
      const key = format(sessionDate, 'yyyy-MM')
      const start = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), 1)
      const status = (session.payment_status || 'pending') as PaymentStatus

      let group = groups.get(key)
      if (!group) {
        group = {
          key,
          label: format(start, 'MMMM yyyy', { locale: ptBR }),
          start,
          sessions: [],
          totalAmount: 0,
          paidCount: 0,
          pendingCount: 0,
          cancelledCount: 0,
          patientIds: new Set()
        }
        groups.set(key, group)
      }

      group.sessions.push(session)
      group.patientIds.add(session.patient_id)
      group.totalAmount += Number(session.session_price || 0)

      if (status === 'paid') {
        group.paidCount += 1
      } else if (status === 'cancelled') {
        group.cancelledCount += 1
      } else {
        group.pendingCount += 1
      }
    })

    return Array.from(groups.values())
      .map(group => ({
        key: group.key,
        label: group.label,
        start: group.start,
        sessions: group.sessions,
        totalAmount: group.totalAmount,
        paidCount: group.paidCount,
        pendingCount: group.pendingCount,
        cancelledCount: group.cancelledCount,
        totalSessions: group.sessions.length,
        patientsCount: group.patientIds.size
      }))
      .sort((a, b) => a.start.getTime() - b.start.getTime())
  }, [sessions])

  const normalizedSearch = normalizeSearchText(searchTerm.trim())

  const filteredMonthGroups = useMemo(() => {
    if (!normalizedSearch) {
      return monthGroups
    }

    return monthGroups.filter(group =>
      group.sessions.some(session =>
        normalizeSearchText(
          session.patients?.full_name ||
          patientNameById.get(session.patient_id) ||
          ''
        ).includes(normalizedSearch)
      )
    )
  }, [monthGroups, normalizedSearch, patientNameById])

  const selectedMonthGroup = useMemo(() => {
    if (!selectedMonthKey) {
      return null
    }

    return monthGroups.find(group => group.key === selectedMonthKey) || null
  }, [monthGroups, selectedMonthKey])

  useEffect(() => {
    if (selectedMonthKey && !selectedMonthGroup) {
      setSelectedMonthKey(null)
    }
  }, [selectedMonthKey, selectedMonthGroup])

  const handleSessionsUpdated = (updatedSessions: Session[]) => {
    if (!updatedSessions.length) {
      return
    }

    setSessions(prev => {
      const sessionMap = new Map(prev.map(session => [session.id, session]))
      updatedSessions.forEach(session => sessionMap.set(session.id, session))
      return Array.from(sessionMap.values())
    })
  }

  const handleEditFromMonth = (session: Session) => {
    setSelectedMonthKey(null)
    setEditingSession(session)
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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">SessÃµes</h1>
          <p className="text-gray-600 mt-2">Gerencie suas sessÃµes de terapia.</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2"
        >
          <Plus className="h-5 w-5" />
          Nova SessÃ£o
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="bg-emerald-50 p-3 rounded-lg">
              <Calendar className="h-6 w-6 text-emerald-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total de SessÃµes</p>
              <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="bg-green-50 p-3 rounded-lg">
              <Clock className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">PrÃ³ximas</p>
              <p className="text-3xl font-bold text-gray-900">{stats.upcoming}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="bg-purple-50 p-3 rounded-lg">
              <FileText className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Realizadas</p>
              <p className="text-3xl font-bold text-gray-900">{stats.completed}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="bg-yellow-50 p-3 rounded-lg">
              <DollarSign className="h-6 w-6 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Pagas</p>
              <p className="text-3xl font-bold text-gray-900">{stats.paid}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Buscar por paciente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Monthly Sessions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Meses com sessoes ({filteredMonthGroups.length})
          </h2>
        </div>

        {filteredMonthGroups.length > 0 ? (
          <div className="divide-y divide-gray-200">
            {filteredMonthGroups.map((group) => (
              <button
                key={group.key}
                type="button"
                onClick={() => setSelectedMonthKey(group.key)}
                className="w-full text-left p-6 hover:bg-gray-50 transition-colors"
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="bg-emerald-50 p-3 rounded-lg">
                      <Calendar className="h-6 w-6 text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 capitalize">{group.label}</h3>
                      <p className="text-sm text-gray-600">
                        {group.totalSessions} sessoes - {group.patientsCount} pacientes
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                    <span className="px-2 py-1 rounded-full bg-green-50 text-green-700">Pago: {group.paidCount}</span>
                    <span className="px-2 py-1 rounded-full bg-yellow-50 text-yellow-700">Pendente: {group.pendingCount}</span>
                    <span className="px-2 py-1 rounded-full bg-red-50 text-red-700">Cancelado: {group.cancelledCount}</span>
                    <span className="font-medium text-gray-900">
                      Total: R$ {group.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Calendar className="h-12 w-12 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? 'Nenhum mes encontrado' : 'Nenhuma sessao agendada'}
            </h3>
            <p className="text-gray-600 mb-6">
              {searchTerm ? 'Tente ajustar o termo de busca.' : 'Comece agendando sua primeira sessao.'}
            </p>
            {!searchTerm && (
              <button
                onClick={() => setShowAddForm(true)}
                className="bg-emerald-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-emerald-700 transition-colors"
              >
                Agendar Primeira Sessao
              </button>
            )}
          </div>
        )}
      </div>

      {selectedMonthGroup && (
        <MonthSessionsModal
          monthLabel={selectedMonthGroup.label}
          sessions={selectedMonthGroup.sessions}
          allSessions={sessions}
          onClose={() => setSelectedMonthKey(null)}
          onSessionsUpdated={handleSessionsUpdated}
          onEditSession={handleEditFromMonth}
          onCancelSession={handleCancelSession}
          getPatientName={getPatientName}
        />
      )}

      {/* Add/Edit Session Modal */}
      {(showAddForm || editingSession) && (
        <SessionModal
          session={editingSession}
          patients={patients}
          sessions={sessions}
          onClose={() => {
            setShowAddForm(false)
            setEditingSession(null)
          }}
          onSave={() => {
            loadData()
            setShowAddForm(false)
            setEditingSession(null)
          }}
        />
      )}
    </div>
  )
}

// Monthly Sessions Modal Component
function MonthSessionsModal({
  monthLabel,
  sessions,
  allSessions,
  onClose,
  onSessionsUpdated,
  onEditSession,
  onCancelSession,
  getPatientName
}: {
  monthLabel: string
  sessions: Session[]
  allSessions: Session[]
  onClose: () => void
  onSessionsUpdated: (updatedSessions: Session[]) => void
  onEditSession: (session: Session) => void
  onCancelSession: (session: Session) => void | Promise<void>
  getPatientName: (patientId: string, fallback?: string) => string
}) {
  type PaymentStatusValue = PaymentStatus | 'mixed'

  type PatientMonthGroup = {
    patientId: string
    patientName: string
    sessions: Session[]
    totalAmount: number
    paidCount: number
    pendingCount: number
    cancelledCount: number
  }

  const [updatingPatientId, setUpdatingPatientId] = useState<string | null>(null)
  const [rescheduleTarget, setRescheduleTarget] = useState<Session | null>(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleLoading, setRescheduleLoading] = useState(false)

  const patientGroups = useMemo<PatientMonthGroup[]>(() => {
    const groups = new Map<string, PatientMonthGroup>()

    sessions.forEach(session => {
      const patientId = session.patient_id
      const patientName = getPatientName(patientId, session.patients?.full_name)
      const status = (session.payment_status || 'pending') as PaymentStatus

      let group = groups.get(patientId)
      if (!group) {
        group = {
          patientId,
          patientName,
          sessions: [],
          totalAmount: 0,
          paidCount: 0,
          pendingCount: 0,
          cancelledCount: 0
        }
        groups.set(patientId, group)
      }

      group.sessions.push(session)
      group.totalAmount += Number(session.session_price || 0)

      if (status === 'paid') {
        group.paidCount += 1
      } else if (status === 'cancelled') {
        group.cancelledCount += 1
      } else {
        group.pendingCount += 1
      }
    })

    return Array.from(groups.values())
      .map(group => ({
        ...group,
        sessions: [...group.sessions].sort(
          (a, b) => parseISO(a.session_date).getTime() - parseISO(b.session_date).getTime()
        )
      }))
      .sort((a, b) => a.patientName.localeCompare(b.patientName))
  }, [sessions])

  const monthTotals = useMemo(() => {
    const totals = sessions.reduce(
      (acc, session) => {
        const status = (session.payment_status || 'pending') as PaymentStatus
        acc.totalAmount += Number(session.session_price || 0)
        acc.totalSessions += 1
        if (status === 'paid') {
          acc.paidCount += 1
        }
        return acc
      },
      { totalAmount: 0, totalSessions: 0, paidCount: 0 }
    )

    return totals
  }, [sessions])

  const statusLabels: Record<PaymentStatusValue, string> = {
    paid: 'Pago',
    pending: 'Pendente',
    cancelled: 'Cancelado',
    mixed: 'Misto'
  }

  const getGroupStatus = (group: PatientMonthGroup): PaymentStatusValue => {
    const statuses = new Set(
      group.sessions.map(session => (session.payment_status || 'pending') as PaymentStatus)
    )

    if (statuses.size === 1) {
      return statuses.values().next().value
    }

    return 'mixed'
  }

  const handleStatusChange = async (group: PatientMonthGroup, newStatus: PaymentStatusValue) => {
    if (newStatus === 'mixed') {
      return
    }

    const currentStatus = getGroupStatus(group)
    if (currentStatus === newStatus) {
      return
    }

    setUpdatingPatientId(group.patientId)

    try {
      const updatedSessions = await sessionService.updateSessionsStatus(
        group.sessions.map(session => session.id),
        newStatus
      )
      onSessionsUpdated(updatedSessions)
      toast.success('Status atualizado e financeiro sincronizado')
    } catch (error) {
      toast.error('Erro ao atualizar status de pagamento')
    } finally {
      setUpdatingPatientId(null)
    }
  }

  const handleRescheduleOpen = (session: Session) => {
    setRescheduleTarget(session)
    setRescheduleDate(format(parseISO(session.session_date), "yyyy-MM-dd'T'HH:mm"))
  }

  const handleRescheduleClose = () => {
    setRescheduleTarget(null)
    setRescheduleDate('')
  }

  const handleRescheduleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!rescheduleTarget || !rescheduleDate) {
      toast.error('Informe a nova data da sessao')
      return
    }

    const candidateStart = parseISO(rescheduleDate)
    if (Number.isNaN(candidateStart.getTime())) {
      toast.error('Data invalida')
      return
    }

    const duration = rescheduleTarget.duration_minutes ?? 50
    const conflict = findSessionConflict(allSessions, candidateStart, duration, {
      excludeSessionId: rescheduleTarget.id
    })

    if (conflict) {
      const conflictName = getPatientName(conflict.patient_id, conflict.patients?.full_name)
      toast.error(`Conflito com sessao de ${conflictName}`)
      return
    }

    setRescheduleLoading(true)

    try {
      const updatedSession = await sessionService.rescheduleSession(
        rescheduleTarget.id,
        rescheduleDate
      )
      onSessionsUpdated([updatedSession])
      toast.success('Sessao remarcada com sucesso')
      handleRescheduleClose()
    } catch (error) {
      toast.error('Erro ao remarcar sessao')
    } finally {
      setRescheduleLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Sessoes de {monthLabel}</h2>
            <p className="text-sm text-gray-600 mt-1">
              {monthTotals.totalSessions} sessoes - {monthTotals.paidCount} pagas - Total: R$ {monthTotals.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Fechar
          </button>
        </div>

        <div className="p-6 space-y-6">
          {patientGroups.length > 0 ? (
            patientGroups.map(group => {
              const statusValue = getGroupStatus(group)
              const statusLabel = statusLabels[statusValue]
              const statusSummary = `${statusLabel} (${group.paidCount}/${group.sessions.length} pagas)`

              return (
                <div key={group.patientId} className="border border-gray-200 rounded-xl p-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">{group.patientName}</h3>
                      <p className="text-sm text-gray-600">
                        {group.sessions.length} sessoes - Total: R$ {group.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="flex flex-col items-start md:items-end gap-2">
                      <span className="text-xs text-gray-500">Status atual: {statusSummary}</span>
                      <select
                        value={statusValue}
                        onChange={(e) => handleStatusChange(group, e.target.value as PaymentStatusValue)}
                        disabled={updatingPatientId === group.patientId}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:opacity-60"
                      >
                        <option value="mixed" disabled>Misto</option>
                        <option value="pending">Pendente</option>
                        <option value="paid">Pago</option>
                        <option value="cancelled">Cancelado</option>
                      </select>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {group.sessions.map(session => {
                      const sessionStatus = (session.payment_status || 'pending') as PaymentStatus
                      const badgeClass = sessionStatus === "paid"
                        ? "bg-green-100 text-green-800"
                        : sessionStatus === "cancelled"
                        ? "bg-red-100 text-red-800"
                        : "bg-yellow-100 text-yellow-800"

                      return (
                        <div
                          key={session.id}
                          className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 bg-gray-50 rounded-lg px-3 py-2"
                        >
                          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              {format(parseISO(session.session_date), 'dd/MM/yyyy')}
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4" />
                              {format(parseISO(session.session_date), 'HH:mm')}
                            </div>
                            {session.session_price && (
                              <span className="text-sm text-gray-700">
                                R$ {Number(session.session_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${badgeClass}`}>
                              {statusLabels[sessionStatus]}
                            </span>
                            <button
                              type="button"
                              onClick={() => onEditSession(session)}
                              className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                              title="Editar sessao"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRescheduleOpen(session)}
                              className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Remarcar sessao"
                              aria-label="Remarcar sessao"
                            >
                              <CalendarClock className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onCancelSession(session)}
                              disabled={session.payment_status === 'cancelled'}
                              className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-60 disabled:hover:bg-transparent"
                              title="Cancelar sessao"
                              aria-label="Cancelar sessao"
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          ) : (
            <div className="text-center text-gray-600">Nenhuma sessao encontrada</div>
          )}
        </div>
      </div>

      {rescheduleTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-xl w-full max-w-lg">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Remarcar sessao
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {getPatientName(rescheduleTarget.patient_id, rescheduleTarget.patients?.full_name)}
              </p>
            </div>
            <form onSubmit={handleRescheduleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nova data e hora
                </label>
                <input
                  type="datetime-local"
                  required
                  value={rescheduleDate}
                  onChange={(event) => setRescheduleDate(event.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleRescheduleClose}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={rescheduleLoading}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-60"
                >
                  {rescheduleLoading ? 'Salvando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// Session Modal Component
function SessionModal({ 
  session, 
  patients,
  sessions,
  onClose, 
  onSave 
}: { 
  session: Session | null
  patients: Patient[]
  sessions: Session[]
  onClose: () => void
  onSave: () => void
}) {
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(
    session ? patients.find(p => p.id === session.patient_id) || null : null
  )
  
  const [formData, setFormData] = useState({
    patient_id: session?.patient_id || '',
    session_date: session?.session_date ? format(parseISO(session.session_date), "yyyy-MM-dd'T'HH:mm") : '',
    duration_minutes: session?.duration_minutes?.toString() || '50',
    session_type: session?.session_type || 'Sessao Individual',
    session_notes: session?.session_notes || '',
    mood_before: session?.mood_before || '',
    mood_after: session?.mood_after || '',
    homework_assigned: session?.homework_assigned || '',
    next_session_date: session?.next_session_date ? format(parseISO(session.next_session_date), "yyyy-MM-dd'T'HH:mm") : '',
    session_price: session?.session_price?.toString() || selectedPatient?.session_price?.toString() || '',
    payment_status: session?.payment_status || 'pending',
    summary: session?.summary || ''
  })
  const [loading, setLoading] = useState(false)
  
  // Atualizar preÃ§o quando paciente for selecionado
  const handlePatientChange = (patientId: string) => {
    const patient = patients.find(p => p.id === patientId)
    setSelectedPatient(patient || null)
    setFormData(prev => ({
      ...prev,
      patient_id: patientId,
      session_price: patient?.session_price?.toString() || ''
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.patient_id || !formData.session_date) {
      toast.error('Paciente e data sÃ£o obrigatÃ³rios')
      return
    }
    
    const candidateStart = parseISO(formData.session_date)
    if (Number.isNaN(candidateStart.getTime())) {
      toast.error('Data invalida')
      return
    }

    const duration = formData.duration_minutes ? Number(formData.duration_minutes) : 50
    const conflict = findSessionConflict(sessions, candidateStart, duration, {
      excludeSessionId: session?.id
    })

    if (conflict) {
      const conflictName = conflict.patients?.full_name || 'paciente'
      toast.error(`Conflito com sessao de ${conflictName}`)
      return
    }

    setLoading(true)

    try {
      const sessionData = {
        patient_id: formData.patient_id,
        session_date: formData.session_date,
        duration_minutes: formData.duration_minutes ? Number(formData.duration_minutes) : undefined,
        session_type: formData.session_type || undefined,
        session_notes: formData.session_notes || undefined,
        mood_before: formData.mood_before || undefined,
        mood_after: formData.mood_after || undefined,
        homework_assigned: formData.homework_assigned || undefined,
        next_session_date: formData.next_session_date || undefined,
        session_price: formData.session_price ? Number(formData.session_price) : undefined,
        payment_status: formData.payment_status || 'pending',
        summary: formData.summary || undefined
      }

      if (session) {
        await sessionService.updateSession(session.id, sessionData)
        toast.success('SessÃ£o atualizada com sucesso')
      } else {
        await sessionService.createSession(sessionData as any)
        toast.success('SessÃ£o criada com sucesso')
      }

      onSave()
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar sessÃ£o')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {session ? 'Editar SessÃ£o' : 'Nova SessÃ£o'}
          </h2>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Information */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">InformaÃ§Ãµes BÃ¡sicas</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Paciente *
                </label>
                <select
                  required
                  value={formData.patient_id}
                  onChange={(e) => handlePatientChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="">Selecione um paciente</option>
                  {patients.filter(p => p.active).map(patient => (
                    <option key={patient.id} value={patient.id}>
                      {patient.full_name} {patient.session_price && `(R$ ${patient.session_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Data e Hora *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={formData.session_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, session_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  DuraÃ§Ã£o (minutos)
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.duration_minutes}
                  onChange={(e) => setFormData(prev => ({ ...prev, duration_minutes: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo de SessÃ£o
                </label>
                <select
                  value={formData.session_type}
                  onChange={(e) => setFormData(prev => ({ ...prev, session_type: e.target.value }))}
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
                  Valor da SessÃ£o (R$) {selectedPatient && '(Valor fixo do paciente)'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.session_price}
                  onChange={(e) => setFormData(prev => ({ ...prev, session_price: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder={selectedPatient ? `Valor padrÃ£o: R$ ${selectedPatient.session_price?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}` : 'Digite o valor'}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Status do Pagamento
                </label>
                <select
                  value={formData.payment_status}
                  onChange={(e) => setFormData(prev => ({ ...prev, payment_status: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="pending">Pendente</option>
                  <option value="paid">Pago</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </div>
            </div>
          </div>
          
          {/* Session Details */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Detalhes da SessÃ£o</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Resumo da SessÃ£o
                </label>
                <textarea
                  rows={4}
                  value={formData.summary}
                  onChange={(e) => setFormData(prev => ({ ...prev, summary: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="Resumo dos principais pontos abordados na sessÃ£o..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  AnotaÃ§Ãµes da SessÃ£o
                </label>
                <textarea
                  rows={3}
                  value={formData.session_notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, session_notes: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="ObservaÃ§Ãµes e anotaÃ§Ãµes importantes..."
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Humor Antes da SessÃ£o
                  </label>
                  <input
                    type="text"
                    value={formData.mood_before}
                    onChange={(e) => setFormData(prev => ({ ...prev, mood_before: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="Ex: Ansioso, Calmo, Irritado..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Humor ApÃ³s a SessÃ£o
                  </label>
                  <input
                    type="text"
                    value={formData.mood_after}
                    onChange={(e) => setFormData(prev => ({ ...prev, mood_after: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="Ex: Mais calmo, Reflexivo, Motivado..."
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tarefa/ExercÃ­cio AtribuÃ­do
                </label>
                <textarea
                  rows={2}
                  value={formData.homework_assigned}
                  onChange={(e) => setFormData(prev => ({ ...prev, homework_assigned: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="ExercÃ­cios ou tarefas para realizar atÃ© a prÃ³xima sessÃ£o..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  PrÃ³xima SessÃ£o
                </label>
                <input
                  type="datetime-local"
                  value={formData.next_session_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, next_session_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
            </div>
          </div>
          
          <div className="flex justify-end gap-4 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Salvando...' : (session ? 'Atualizar' : 'Criar')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

