import React, { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { patientService } from '../services/patientService'
import { sessionService } from '../services/sessionService'
import { financialService } from '../services/financialService'
import { supabase } from '../lib/supabase'
import { Patient, Session, FinancialRecord } from '../types'
import { 
  Users, 
  Calendar, 
  DollarSign, 
  TrendingUp,
  Clock,
  AlertCircle,
  FileText,
  Link2
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import toast from 'react-hot-toast'

export default function Dashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState({
    totalPatients: 0,
    activePatients: 0,
    upcomingSessions: 0,
    weeklyRevenue: 0,
    monthlyRevenue: 0,
    receivableAmount: 0
  })
  const [upcomingSessions, setUpcomingSessions] = useState<Session[]>([])
  const [recentTransactions, setRecentTransactions] = useState<FinancialRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [scheduleLink, setScheduleLink] = useState('')
  const [scheduleLinkLoading, setScheduleLinkLoading] = useState(false)

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      setLoading(true)
      
      // Load patients
      const patients = await patientService.getPatients()
      const activePatients = patients.filter(p => p.active)
      
      const [sessions, upcomingSessions] = await Promise.all([
        sessionService.getSessions(),
        sessionService.getUpcomingSessions()
      ])
      
      // Load financial data
      const weeklyRevenue = await financialService.getWeeklyRevenue()
      const monthlyRevenue = await financialService.getMonthlyRevenue()
      const transactions = await financialService.getFinancialRecords()
      
      const receivableAmount = sessions
        .filter(session => session.payment_status === 'pending')
        .reduce((sum, session) => sum + Number(session.session_price || 0), 0)

      setStats({
        totalPatients: patients.length,
        activePatients: activePatients.length,
        upcomingSessions: upcomingSessions.length,
        weeklyRevenue,
        monthlyRevenue,
        receivableAmount
      })
      
      setUpcomingSessions(upcomingSessions)
      setRecentTransactions(transactions.slice(0, 5))
    } catch (error) {
      console.error('Error loading dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const buildScheduleLink = (token: string) => {
    if (typeof window === 'undefined') {
      return ''
    }
    return `${window.location.origin}/link-de-agendamento?token=${token}`
  }

  const handleGenerateScheduleLink = async () => {
    if (!user) {
      toast.error('Usuário não autenticado')
      return
    }

    try {
      setScheduleLinkLoading(true)
      const { data, error } = await supabase
        .from('public_schedule_links')
        .select('token')
        .eq('user_id', user.id)
        .is('revoked_at', null)
        .order('created_at', { ascending: false })
        .limit(1)

      if (error) throw error

      const existingToken = data?.[0]?.token
      if (existingToken) {
        setScheduleLink(buildScheduleLink(existingToken))
        toast.success('Link carregado com sucesso')
        return
      }

      const newToken = crypto.randomUUID().replace(/-/g, '')
      const { data: created, error: insertError } = await supabase
        .from('public_schedule_links')
        .insert({ user_id: user.id, token: newToken })
        .select('token')
        .single()

      if (insertError) throw insertError

      const token = created?.token || newToken
      setScheduleLink(buildScheduleLink(token))
      toast.success('Link gerado com sucesso')
    } catch (error) {
      console.error('Erro ao gerar link de agendamento:', error)
      toast.error('Falha ao gerar link de agendamento')
    } finally {
      setScheduleLinkLoading(false)
    }
  }

  const handleCopyScheduleLink = async () => {
    if (!scheduleLink) {
      toast.error('Gere o link primeiro')
      return
    }

    try {
      await navigator.clipboard.writeText(scheduleLink)
      toast.success('Link copiado')
    } catch (error) {
      toast.error('Falha ao copiar link')
    }
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
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-2">
            Bem-vindo de volta! Aqui está um resumo da sua prática.
          </p>
        </div>
        <button
          type="button"
          onClick={handleGenerateScheduleLink}
          disabled={scheduleLinkLoading}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <Link2 className="h-4 w-4" />
          {scheduleLinkLoading ? 'Gerando...' : 'Gerar link de agendamento'}
        </button>
      </div>

      {(scheduleLink || scheduleLinkLoading) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Link de agendamento</h2>
              <p className="text-sm text-gray-600">
                Compartilhe com o paciente para ele preencher os dados e reservar horário.
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyScheduleLink}
              disabled={!scheduleLink}
              className="px-4 py-2 border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-50 transition-colors disabled:opacity-60"
            >
              Copiar link
            </button>
          </div>
          <div className="mt-4">
            <input
              type="text"
              readOnly
              value={scheduleLink || 'Gerando link...'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 min-w-0">
          <div className="flex items-center gap-2">
            <div className="bg-emerald-50 p-2 rounded-lg">
              <Users className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-600">Pacientes Ativos</p>
              <p className="text-xl font-bold text-gray-900">{stats.activePatients}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 min-w-0">
          <div className="flex items-center gap-2">
            <div className="bg-green-50 p-2 rounded-lg">
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-600">Próximas Sessões</p>
              <p className="text-xl font-bold text-gray-900">{stats.upcomingSessions}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 min-w-0">
          <div className="flex items-center gap-2">
            <div className="bg-yellow-50 p-2 rounded-lg">
              <DollarSign className="h-5 w-5 text-yellow-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-600">Receita Semanal</p>
              <p className="text-xl font-bold text-gray-900 whitespace-nowrap">
                R$ {stats.weeklyRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 min-w-0">
          <div className="flex items-center gap-2">
            <div className="bg-purple-50 p-2 rounded-lg">
              <TrendingUp className="h-5 w-5 text-purple-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-600">Receita Mensal</p>
              <p className="text-xl font-bold text-gray-900 whitespace-nowrap">
                R$ {stats.monthlyRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 min-w-0">
          <div className="flex items-center gap-2">
            <div className="bg-yellow-50 p-2 rounded-lg">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-600">A Receber</p>
              <p className="text-xl font-bold text-gray-900 whitespace-nowrap">
                R$ {stats.receivableAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Upcoming Sessions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-gray-900">Próximas Sessões</h2>
              <Clock className="h-5 w-5 text-gray-400" />
            </div>
          </div>
          <div className="p-6">
            {upcomingSessions.length > 0 ? (
              <div className="space-y-4">
                {upcomingSessions.map((session) => (
                  <div key={session.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{session.patients?.full_name}</p>
                      <p className="text-sm text-gray-600">
                        {format(parseISO(session.session_date), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-sm font-medium text-gray-900">
                        {session.duration_minutes} min
                      </p>
                      <p className="text-sm text-gray-600">{session.session_type}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Nenhuma sessão agendada</p>
              </div>
            )}
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-gray-900">Transações Recentes</h2>
              <DollarSign className="h-5 w-5 text-gray-400" />
            </div>
          </div>
          <div className="p-6">
            {recentTransactions.length > 0 ? (
              <div className="space-y-4">
                {recentTransactions.map((transaction) => (
                  <div key={transaction.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <div className={`p-2 rounded-full ${
                        transaction.transaction_type === 'income' 
                          ? 'bg-green-50' 
                          : 'bg-red-50'
                      }`}>
                        <DollarSign className={`h-4 w-4 ${
                          transaction.transaction_type === 'income' 
                            ? 'text-green-600' 
                            : 'text-red-600'
                        }`} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900">
                          {transaction.patients?.full_name || transaction.description}
                        </p>
                        <p className="text-sm text-gray-600">
                          {format(new Date(transaction.transaction_date), 'dd/MM/yyyy')}
                        </p>
                      </div>
                    </div>
                    <div className="sm:text-right">
                      <p className={`font-medium ${
                        transaction.transaction_type === 'income' 
                          ? 'text-green-600' 
                          : 'text-red-600'
                      }`}>
                        {transaction.transaction_type === 'income' ? '+' : '-'}R$ {Number(transaction.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-sm text-gray-600 capitalize">
                        {transaction.payment_method}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Nenhuma transação registrada</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
