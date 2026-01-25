import React, { useState, useEffect } from 'react'
import { financialService } from '../services/financialService'
import { patientService } from '../services/patientService'
import { sessionService } from '../services/sessionService'
import { FinancialRecord, Patient, Session } from '../types'
import { Plus, Search, DollarSign, TrendingUp, TrendingDown, Calendar, Edit, Trash2, FileText, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfDay, endOfDay, parseISO, subMonths, subYears, addMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { normalizeSearchText } from '../lib/search'

export default function Financial() {
  const [records, setRecords] = useState<FinancialRecord[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingRecord, setEditingRecord] = useState<FinancialRecord | null>(null)
  const [dateRange, setDateRange] = useState<'month' | 'quarter' | 'year' | 'next_quarter' | 'next_year' | 'all'>('month')
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<'all' | 'income' | 'expense'>('all')
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('all')
  const [sessionStatusFilter, setSessionStatusFilter] = useState<'all' | 'paid' | 'pending' | 'cancelled'>('all')
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [recordsData, patientsData, sessionsData] = await Promise.all([
        financialService.getFinancialRecords(),
        patientService.getPatients(),
        sessionService.getSessions()
      ])
      
      setRecords(recordsData)
      setPatients(patientsData)
      setSessions(sessionsData)
    } catch (error) {
      toast.error('Erro ao carregar dados financeiros')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este registro?')) return

    try {
      const { error } = await financialService.deleteFinancialRecord(id)
      if (error) throw error
      
      setRecords(prev => prev.filter(r => r.id !== id))
      toast.success('Registro excluído com sucesso')
      loadData() // Reload to update stats
    } catch (error) {
      toast.error('Erro ao excluir registro')
    }
  }

  const resetFilters = () => {
    setDateRange('month')
    setTransactionTypeFilter('all')
    setPaymentMethodFilter('all')
    setSessionStatusFilter('all')
  }

  const applyQuickFilter = (preset: 'revenue' | 'pending' | 'pix' | 'quarter') => {
    if (preset === 'revenue') {
      setDateRange('month')
      setTransactionTypeFilter('income')
      setPaymentMethodFilter('all')
      return
    }
    if (preset === 'pending') {
      setDateRange('month')
      setSessionStatusFilter('pending')
      return
    }
    if (preset === 'pix') {
      setPaymentMethodFilter('pix')
      setTransactionTypeFilter('income')
      return
    }
    if (preset === 'quarter') {
      setDateRange('quarter')
      return
    }
  }

  const { rangeStart, rangeEnd } = (() => {
    const now = new Date()
    if (dateRange === 'month') {
      return { rangeStart: startOfMonth(now), rangeEnd: endOfMonth(now) }
    }
    if (dateRange === 'quarter') {
      return { rangeStart: startOfDay(subMonths(now, 3)), rangeEnd: endOfDay(now) }
    }
    if (dateRange === 'year') {
      return { rangeStart: startOfDay(subYears(now, 1)), rangeEnd: endOfDay(now) }
    }
    if (dateRange === 'next_quarter') {
      return { rangeStart: startOfDay(now), rangeEnd: endOfMonth(addMonths(now, 2)) }
    }
    if (dateRange === 'next_year') {
      return { rangeStart: startOfDay(now), rangeEnd: endOfMonth(addMonths(now, 11)) }
    }
    return { rangeStart: null, rangeEnd: null }
  })()

  const dateWithinRange = (date: Date) => {
    if (rangeStart && date < rangeStart) {
      return false
    }
    if (rangeEnd && date > rangeEnd) {
      return false
    }
    return true
  }

  const recordMatchesRange = (record: FinancialRecord) => {
    if (!rangeStart && !rangeEnd) {
      return true
    }
    const recordDate = parseISO(record.transaction_date)
    return dateWithinRange(recordDate)
  }

  const sessionMatchesRange = (session: Session) => {
    if (!rangeStart && !rangeEnd) {
      return true
    }
    const sessionDate = parseISO(session.session_date)
    return dateWithinRange(sessionDate)
  }

  const statsNow = new Date()
  const weekStart = startOfWeek(statsNow)
  const weekEnd = endOfWeek(statsNow)
  const monthStart = startOfMonth(statsNow)
  const monthEnd = endOfMonth(statsNow)

  const isFutureRange = dateRange === 'next_quarter' || dateRange === 'next_year'

  const statsRecordsBase = records.filter((record) => {
    if (transactionTypeFilter !== 'all' && record.transaction_type !== transactionTypeFilter) {
      return false
    }
    if (paymentMethodFilter !== 'all' && record.payment_method !== paymentMethodFilter) {
      return false
    }
    return true
  })

  const statsRecords = isFutureRange
    ? statsRecordsBase
    : statsRecordsBase.filter(recordMatchesRange)

  const statsSessionsBase = sessions.filter((session) => session.payment_status === 'paid')
  const statsSessions = isFutureRange
    ? statsSessionsBase
    : statsSessionsBase.filter(sessionMatchesRange)

  const weeklyRevenueSum = statsSessions
    .filter((record) => {
      const recordDate = parseISO(record.session_date)
      return recordDate >= weekStart && recordDate <= weekEnd
    })
    .reduce((sum, record) => sum + Number(record.session_price || 0), 0)

  const weeklyRevenueCount = statsSessions
    .filter((record) => {
      const recordDate = parseISO(record.session_date)
      return recordDate >= weekStart && recordDate <= weekEnd
    }).length

  const revenueEnabled = transactionTypeFilter !== 'expense'
  const weeklyRevenue = revenueEnabled
    ? ((dateRange === 'next_quarter' || dateRange === 'next_year')
        ? (weeklyRevenueCount > 0 ? weeklyRevenueSum / weeklyRevenueCount : 0)
        : weeklyRevenueSum)
    : 0

  const monthlyRevenueSum = statsSessions
    .filter((record) => {
      const recordDate = parseISO(record.session_date)
      return recordDate >= monthStart && recordDate <= monthEnd
    })
    .reduce((sum, record) => sum + Number(record.session_price || 0), 0)
  const monthlyRevenue = revenueEnabled ? monthlyRevenueSum : 0

  const weeklyExpensesSum = statsRecords
    .filter((record) => record.transaction_type === 'expense')
    .filter((record) => {
      const recordDate = parseISO(record.transaction_date)
      if (!isFutureRange && !dateWithinRange(recordDate)) {
        return false
      }
      return recordDate >= weekStart && recordDate <= weekEnd
    })
    .reduce((sum, record) => sum + Number(record.amount), 0)

  const weeklyExpensesCount = statsRecords
    .filter((record) => record.transaction_type === 'expense')
    .filter((record) => {
      const recordDate = parseISO(record.transaction_date)
      if (!isFutureRange && !dateWithinRange(recordDate)) {
        return false
      }
      return recordDate >= weekStart && recordDate <= weekEnd
    }).length

  const weeklyExpenses = (dateRange === 'next_quarter' || dateRange === 'next_year')
    ? (weeklyExpensesCount > 0 ? weeklyExpensesSum / weeklyExpensesCount : 0)
    : weeklyExpensesSum

  const monthlyExpenses = statsRecords
    .filter((record) => record.transaction_type === 'expense')
    .filter((record) => {
      const recordDate = parseISO(record.transaction_date)
      if (!isFutureRange && !dateWithinRange(recordDate)) {
        return false
      }
      return recordDate >= monthStart && recordDate <= monthEnd
    })
    .reduce((sum, record) => sum + Number(record.amount), 0)

  const monthlyBalance = monthlyRevenue - monthlyExpenses

  const filteredRecords = records.filter((record) => {
    if (!recordMatchesRange(record)) {
      return false
    }
    if (transactionTypeFilter !== 'all' && record.transaction_type !== transactionTypeFilter) {
      return false
    }
    if (paymentMethodFilter !== 'all' && record.payment_method !== paymentMethodFilter) {
      return false
    }
    const needle = normalizeSearchText(searchTerm.trim())
    if (!needle) {
      return true
    }
    return (
      normalizeSearchText(record.patients?.full_name || '').includes(needle) ||
      normalizeSearchText(record.description || '').includes(needle) ||
      normalizeSearchText(record.payment_method || '').includes(needle)
    )
  })

  const sessionsInRange = sessions.filter(sessionMatchesRange)

  const statusChartSessions = sessionsInRange.filter((session) => session.session_price !== null && session.session_price !== undefined)

  const pendingReceivable = sessionsInRange
    .filter((session) => {
      if (dateRange === 'month') {
        return session.payment_status === 'pending'
      }
      return session.payment_status === 'paid' || session.payment_status === 'pending'
    })
    .reduce((sum, session) => sum + Number(session.session_price || 0), 0)

  const revenueSessions = statusChartSessions.filter((session) => {
    if (sessionStatusFilter === 'all') {
      return session.payment_status === 'paid'
    }
    return session.payment_status === sessionStatusFilter
  })

  const showIncome = transactionTypeFilter === 'all' || transactionTypeFilter === 'income'
  const showExpense = transactionTypeFilter === 'all' || transactionTypeFilter === 'expense'

  const monthlyMap = new Map<string, { date: Date; month: string; receita: number; despesa: number }>()
  for (const record of filteredRecords) {
    const recordDate = parseISO(record.transaction_date)
    const monthKey = format(recordDate, 'yyyy-MM')
    const monthLabel = format(recordDate, 'MMM', { locale: ptBR })
    const existing = monthlyMap.get(monthKey) || {
      date: startOfMonth(recordDate),
      month: monthLabel,
      receita: 0,
      despesa: 0
    }
    if (record.transaction_type === 'income') {
      existing.receita += Number(record.amount)
    } else {
      existing.despesa += Number(record.amount)
    }
    monthlyMap.set(monthKey, existing)
  }

  const chartData = Array.from(monthlyMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime())

  const totals = filteredRecords.reduce(
    (acc, record) => {
      if (record.transaction_type === 'income') {
        acc.income += Number(record.amount)
      } else {
        acc.expense += Number(record.amount)
      }
      return acc
    },
    { income: 0, expense: 0 }
  )

  const pieData = [
    { name: 'Receitas', value: totals.income, color: '#10b981' },
    { name: 'Despesas', value: totals.expense, color: '#ef4444' }
  ]

  const paymentMethods = Array.from(new Set(records.map((record) => record.payment_method))).sort()

  const paymentMethodLabels: Record<string, string> = {
    cash: 'Dinheiro',
    credit_card: 'Cartao de credito',
    debit_card: 'Cartao de debito',
    bank_transfer: 'Transferencia',
    pix: 'PIX'
  }

  const paymentMethodData = filteredRecords
    .filter((record) => record.transaction_type === 'income')
    .reduce((acc, record) => {
      const key = record.payment_method || 'other'
      acc[key] = (acc[key] || 0) + Number(record.amount)
      return acc
    }, {} as Record<string, number>)

  const paymentMethodChartData = Object.entries(paymentMethodData).map(([method, value]) => ({
    name: paymentMethodLabels[method] || method,
    value
  }))

  const statusLabels: Record<string, string> = {
    paid: 'Pago',
    pending: 'Pendente',
    cancelled: 'Cancelado'
  }

  const revenueStatusLabel = sessionStatusFilter === 'all'
    ? 'Pago'
    : (statusLabels[sessionStatusFilter] || sessionStatusFilter)

  const statusTotals = statusChartSessions.reduce((acc, session) => {
    const status = session.payment_status || 'pending'
    const amount = session.session_price ? Number(session.session_price) : 0
    acc[status] = acc[status] || { value: 0, count: 0 }
    acc[status].value += amount
    acc[status].count += 1
    return acc
  }, {} as Record<string, { value: number; count: number }>)

  const paymentStatusChartData = Object.entries(statusTotals).map(([status, data]) => ({
    name: statusLabels[status] || status,
    value: data.value,
    count: data.count
  }))

  const frequencyLabels: Record<string, string> = {
    weekly: 'Semanal',
    biweekly: 'Quinzenal',
    monthly: 'Mensal',
    as_needed: 'Conforme necessario'
  }

  const patientFrequencyMap = new Map(patients.map((patient) => [patient.id, patient.session_frequency]))
  const frequencyTotals = revenueSessions.reduce((acc, session) => {
    const frequency = patientFrequencyMap.get(session.patient_id) || 'unknown'
    const amount = session.session_price ? Number(session.session_price) : 0
    acc[frequency] = (acc[frequency] || 0) + amount
    return acc
  }, {} as Record<string, number>)

  const frequencyChartData = Object.entries(frequencyTotals).map(([frequency, value]) => ({
    name: frequencyLabels[frequency] || 'Sem frequencia',
    value
  }))

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
          <h1 className="text-3xl font-bold text-gray-900">Financeiro</h1>
          <p className="text-gray-600 mt-2">Controle suas receitas e despesas.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          <a
            href="https://cav.receita.fazenda.gov.br/autenticacao/login"
            target="_blank"
            rel="noreferrer"
            className="border border-emerald-200 text-emerald-700 px-4 py-2 rounded-lg font-medium hover:bg-emerald-50 transition-colors flex items-center justify-center gap-2 w-full sm:w-auto"
          >
            <FileText className="h-5 w-5" />
            Gerar Recibo
          </a>
          <button
            onClick={() => setShowAddForm(true)}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 w-full sm:w-auto"
          >
            <Plus className="h-5 w-5" />
            Nova Transação
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3">
            <div className="bg-green-50 p-3 rounded-lg">
              <TrendingUp className="h-6 w-6 text-green-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-600">Receita Semanal</p>
              <p className="text-xl font-bold text-gray-900 whitespace-nowrap">
                R$ {weeklyRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-50 p-3 rounded-lg">
              <DollarSign className="h-6 w-6 text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-600">Receita Mensal</p>
              <p className="text-xl font-bold text-gray-900 whitespace-nowrap">
                R$ {monthlyRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3">
            <div className="bg-red-50 p-3 rounded-lg">
              <TrendingDown className="h-6 w-6 text-red-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-600">Despesas Semanais</p>
              <p className="text-xl font-bold text-gray-900 whitespace-nowrap">
                R$ {weeklyExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3">
            <div className="bg-purple-50 p-3 rounded-lg">
              <Calendar className="h-6 w-6 text-purple-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-600">Saldo Mensal</p>
              <p className={`text-xl font-bold whitespace-nowrap ${
                monthlyBalance >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                R$ {monthlyBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3">
            <div className="bg-yellow-50 p-3 rounded-lg">
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-600">A Receber</p>
              <p className="text-xl font-bold text-gray-900 whitespace-nowrap">
                R$ {pendingReceivable.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Filtros e insights</h3>
            <button
              onClick={resetFilters}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Limpar filtros
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Periodo
              </label>
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="month">Mes atual</option>
                <option value="quarter">Ultimos 3 meses</option>
                <option value="next_quarter">Proximos 3 meses</option>
                <option value="year">Ultimos 12 meses</option>
                <option value="next_year">Proximos 12 meses</option>
                <option value="all">Todo o periodo</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tipo de transacao
              </label>
              <select
                value={transactionTypeFilter}
                onChange={(e) => setTransactionTypeFilter(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="all">Receitas e despesas</option>
                <option value="income">Somente receitas</option>
                <option value="expense">Somente despesas</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Metodo de pagamento
              </label>
              <select
                value={paymentMethodFilter}
                onChange={(e) => setPaymentMethodFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="all">Todos</option>
                {paymentMethods.map((method) => (
                  <option key={method} value={method}>
                    {paymentMethodLabels[method] || method}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status de pagamento (sessao)
              </label>
              <select
                value={sessionStatusFilter}
                onChange={(e) => setSessionStatusFilter(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="all">Todos</option>
                <option value="paid">Pago</option>
                <option value="pending">Pendente</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => applyQuickFilter('revenue')}
              className="px-3 py-1.5 text-sm bg-emerald-50 text-emerald-700 rounded-full hover:bg-emerald-100"
            >
              Receitas do mes
            </button>
            <button
              type="button"
              onClick={() => applyQuickFilter('pending')}
              className="px-3 py-1.5 text-sm bg-yellow-50 text-yellow-700 rounded-full hover:bg-yellow-100"
            >
              Pendentes do mes
            </button>
            <button
              type="button"
              onClick={() => applyQuickFilter('pix')}
              className="px-3 py-1.5 text-sm bg-emerald-50 text-emerald-700 rounded-full hover:bg-emerald-100"
            >
              PIX
            </button>
            <button
              type="button"
              onClick={() => applyQuickFilter('quarter')}
              className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200"
            >
              Ultimos 3 meses
            </button>
          </div>

          <p className="text-sm text-gray-500">
            Sugestoes: combine periodo + status da sessao para comparar receita esperada e recebida.
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Receitas vs Despesas</h3>
          {chartData.length === 0 ? (
            <p className="text-sm text-gray-500">Sem dados para os filtros atuais.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: 'var(--chart-text)' }}
                  axisLine={{ stroke: 'var(--chart-grid)' }}
                  tickLine={{ stroke: 'var(--chart-grid)' }}
                />
                <YAxis
                  tick={{ fill: 'var(--chart-text)' }}
                  axisLine={{ stroke: 'var(--chart-grid)' }}
                  tickLine={{ stroke: 'var(--chart-grid)' }}
                />
                <Tooltip formatter={(value) => `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
                {showIncome && <Bar dataKey="receita" fill="#10b981" name="Receitas" />}
                {showExpense && <Bar dataKey="despesa" fill="#ef4444" name="Despesas" />}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Distribuicao por tipo</h3>
          {pieData.every((entry) => entry.value === 0) ? (
            <p className="text-sm text-gray-500">Sem dados para os filtros atuais.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  dataKey="value"
                  label={({ name, value }) => `${name}: R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Status de pagamento (valor)</h3>
          {paymentStatusChartData.length === 0 ? (
            <p className="text-sm text-gray-500">Sem dados de sessao para o periodo.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={paymentStatusChartData}
                  cx="50%"
                  cy="45%"
                  outerRadius={90}
                  dataKey="value"
                  label={false}
                  labelLine={false}
                >
                  {paymentStatusChartData.map((entry, index) => (
                    <Cell key={`cell-status-${index}`} fill={['#10b981', '#f59e0b', '#ef4444', '#94a3b8'][index % 4]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name, props: any) => {
                    const count = props?.payload?.count || 0
                    return [`R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${count})`, name]
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(value, entry: any) => {
                    const amount = entry?.payload?.value ?? 0
                    return `${value}: R$ ${Number(amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                  }}
                  wrapperStyle={{ color: 'var(--chart-text)', fontSize: '0.75rem' }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">
            Receita por frequencia (status: {revenueStatusLabel})
          </h3>
          {frequencyChartData.length === 0 ? (
            <p className="text-sm text-gray-500">Sem sessoes com valor para o periodo.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={frequencyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: 'var(--chart-text)' }}
                  axisLine={{ stroke: 'var(--chart-grid)' }}
                  tickLine={{ stroke: 'var(--chart-grid)' }}
                />
                <YAxis
                  tick={{ fill: 'var(--chart-text)' }}
                  axisLine={{ stroke: 'var(--chart-grid)' }}
                  tickLine={{ stroke: 'var(--chart-grid)' }}
                />
                <Tooltip formatter={(value) => `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
                <Bar dataKey="value" fill="#10b981" name="Receita" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Metodo de pagamento (receitas)</h3>
          {paymentMethodChartData.length === 0 ? (
            <p className="text-sm text-gray-500">Sem receitas para os filtros atuais.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={paymentMethodChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: 'var(--chart-text)' }}
                  axisLine={{ stroke: 'var(--chart-grid)' }}
                  tickLine={{ stroke: 'var(--chart-grid)' }}
                />
                <YAxis
                  tick={{ fill: 'var(--chart-text)' }}
                  axisLine={{ stroke: 'var(--chart-grid)' }}
                  tickLine={{ stroke: 'var(--chart-grid)' }}
                />
                <Tooltip formatter={(value) => `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
                <Bar dataKey="value" fill="#10b981" name="Receitas" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Dicas de analise</h3>
          <div className="space-y-4 text-sm text-gray-600">
            <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
              Use o filtro de status para comparar receita recebida vs pendente.
            </div>
            <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
              Combine periodo + metodo de pagamento para identificar preferencia dos pacientes.
            </div>
            <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
              Ajuste a frequencia para ver impacto direto no faturamento esperado.
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          <input
            type="text"
            placeholder="Buscar transações..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Records List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Transações Recentes ({filteredRecords.length})
          </h2>
        </div>
        
        {filteredRecords.length > 0 ? (
          <div className="divide-y divide-gray-200">
            {filteredRecords.map((record) => (
              <div key={record.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start sm:items-center gap-4 min-w-0">
                    <div className={`p-3 rounded-full ${
                      record.transaction_type === 'income' 
                        ? 'bg-green-50' 
                        : 'bg-red-50'
                    }`}>
                      <DollarSign className={`h-5 w-5 ${
                        record.transaction_type === 'income' 
                          ? 'text-green-600' 
                          : 'text-red-600'
                      }`} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-medium text-gray-900">
                        {record.patients?.full_name || record.description}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                        <span>{format(parseISO(record.transaction_date), 'dd/MM/yyyy')}</span>
                        <span className="capitalize">{record.payment_method}</span>
                        {record.category && <span>{record.category}</span>}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto sm:justify-end">
                    <div className="sm:text-right">
                      <p className={`text-lg font-semibold ${
                        record.transaction_type === 'income' 
                          ? 'text-green-600' 
                          : 'text-red-600'
                      }`}>
                        {record.transaction_type === 'income' ? '+' : '-'}R$ {Number(record.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-sm text-gray-600 capitalize">
                        {record.transaction_type === 'income' ? 'Receita' : 'Despesa'}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingRecord(record)}
                        className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        title="Editar transação"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(record.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Excluir transação"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <DollarSign className="h-12 w-12 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? 'Nenhuma transação encontrada' : 'Nenhuma transação registrada'}
            </h3>
            <p className="text-gray-600 mb-6">
              {searchTerm 
                ? 'Tente ajustar os termos da sua busca.' 
                : 'Comece registrando sua primeira transação.'
              }
            </p>
            {!searchTerm && (
              <button
                onClick={() => setShowAddForm(true)}
                className="bg-emerald-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-emerald-700 transition-colors"
              >
                Registrar Primeira Transação
              </button>
            )}
          </div>
        )}
      </div>

      {/* Add/Edit Record Modal */}
      {(showAddForm || editingRecord) && (
        <FinancialModal
          record={editingRecord}
          patients={patients}
          onClose={() => {
            setShowAddForm(false)
            setEditingRecord(null)
          }}
          onSave={() => {
            loadData()
            setShowAddForm(false)
            setEditingRecord(null)
          }}
        />
      )}
    </div>
  )
}

// Financial Modal Component
function FinancialModal({ 
  record, 
  patients,
  onClose, 
  onSave 
}: { 
  record: FinancialRecord | null
  patients: Patient[]
  onClose: () => void
  onSave: () => void
}) {
  const [formData, setFormData] = useState({
    transaction_type: record?.transaction_type || 'income',
    patient_id: record?.patient_id || '',
    amount: record?.amount?.toString() || '',
    description: record?.description || '',
    payment_method: record?.payment_method || 'cash',
    transaction_date: record?.transaction_date ? format(new Date(record.transaction_date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
    category: record?.category || ''
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.amount || Number(formData.amount) <= 0) {
      toast.error('Digite um valor válido')
      return
    }
    
    setLoading(true)

    try {
      const recordData = {
        transaction_type: formData.transaction_type as 'income' | 'expense',
        patient_id: formData.patient_id || undefined,
        amount: Number(formData.amount),
        description: formData.description || undefined,
        payment_method: formData.payment_method,
        transaction_date: formData.transaction_date,
        category: formData.category || undefined
      }

      console.log('Submitting financial record:', recordData)

      if (record) {
        const updateData = {
        ...formData,
        amount: Number(formData.amount),
        patient_id: formData.patient_id || null
      }
        const { error } = await financialService.updateFinancialRecord(record.id, updateData)
        if (error) throw error
        toast.success('Transação atualizada com sucesso')
      } else {
        const { error } = await financialService.createFinancialRecord(recordData)
        if (error) throw error
        toast.success('Transação criada com sucesso')
      }

      onSave()
    } catch (error: any) {
      console.error('Error saving financial record:', error)
      toast.error(error.message || 'Erro ao salvar transação')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {record ? 'Editar Transação' : 'Nova Transação'}
          </h2>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo *
            </label>
            <select
              required
              value={formData.transaction_type}
              onChange={(e) => setFormData(prev => ({ ...prev, transaction_type: e.target.value as any }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            >
              <option value="income">Receita</option>
              <option value="expense">Despesa</option>
            </select>
          </div>
          
          {formData.transaction_type === 'income' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Paciente
              </label>
              <select
                value={formData.patient_id}
                onChange={(e) => setFormData(prev => ({ ...prev, patient_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="">Selecione um paciente</option>
                {patients.map(patient => (
                  <option key={patient.id} value={patient.id}>
                    {patient.full_name}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Valor (R$) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={formData.amount}
              onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Descrição
            </label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              placeholder="Descrição da transação..."
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Método de Pagamento *
            </label>
            <select
              required
              value={formData.payment_method}
              onChange={(e) => setFormData(prev => ({ ...prev, payment_method: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            >
              <option value="cash">Dinheiro</option>
              <option value="credit_card">Cartão de Crédito</option>
              <option value="debit_card">Cartão de Débito</option>
              <option value="bank_transfer">Transferência</option>
              <option value="pix">PIX</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Data *
            </label>
            <input
              type="date"
              required
              value={formData.transaction_date}
              onChange={(e) => setFormData(prev => ({ ...prev, transaction_date: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Categoria
            </label>
            <input
              type="text"
              value={formData.category}
              onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              placeholder="Ex: Consulta, Material, Aluguel..."
            />
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
              {loading ? 'Salvando...' : (record ? 'Atualizar' : 'Criar')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


