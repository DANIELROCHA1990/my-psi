import React, { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { patientService } from '../services/patientService'
import { sessionService } from '../services/sessionService'
import { financialService } from '../services/financialService'
import { Patient, Session, FinancialRecord } from '../types'
import { 
  Users, 
  Calendar, 
  DollarSign, 
  TrendingUp,
  Clock,
  AlertCircle,
  FileText
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default function Dashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState({
    totalPatients: 0,
    activePatients: 0,
    upcomingSessions: 0,
    weeklyRevenue: 0,
    monthlyRevenue: 0
  })
  const [upcomingSessions, setUpcomingSessions] = useState<Session[]>([])
  const [recentTransactions, setRecentTransactions] = useState<FinancialRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      setLoading(true)
      
      // Load patients
      const patients = await patientService.getPatients()
      const activePatients = patients.filter(p => p.active)
      
      // Load upcoming sessions
      const sessions = await sessionService.getUpcomingSessions()
      
      // Load financial data
      const weeklyRevenue = await financialService.getWeeklyRevenue()
      const monthlyRevenue = await financialService.getMonthlyRevenue()
      const transactions = await financialService.getFinancialRecords()
      
      setStats({
        totalPatients: patients.length,
        activePatients: activePatients.length,
        upcomingSessions: sessions.length,
        weeklyRevenue,
        monthlyRevenue
      })
      
      setUpcomingSessions(sessions)
      setRecentTransactions(transactions.slice(0, 5))
    } catch (error) {
      console.error('Error loading dashboard data:', error)
    } finally {
      setLoading(false)
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
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-2">
          Bem-vindo de volta! Aqui está um resumo da sua prática.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="bg-emerald-50 p-3 rounded-lg">
              <Users className="h-6 w-6 text-emerald-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Pacientes Ativos</p>
              <p className="text-3xl font-bold text-gray-900">{stats.activePatients}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="bg-green-50 p-3 rounded-lg">
              <Calendar className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Próximas Sessões</p>
              <p className="text-3xl font-bold text-gray-900">{stats.upcomingSessions}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="bg-yellow-50 p-3 rounded-lg">
              <DollarSign className="h-6 w-6 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Receita Semanal</p>
              <p className="text-3xl font-bold text-gray-900">
                R$ {stats.weeklyRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="bg-purple-50 p-3 rounded-lg">
              <TrendingUp className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Receita Mensal</p>
              <p className="text-3xl font-bold text-gray-900">
                R$ {stats.monthlyRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Upcoming Sessions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Próximas Sessões</h2>
              <Clock className="h-5 w-5 text-gray-400" />
            </div>
          </div>
          <div className="p-6">
            {upcomingSessions.length > 0 ? (
              <div className="space-y-4">
                {upcomingSessions.map((session) => (
                  <div key={session.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{session.patients?.full_name}</p>
                      <p className="text-sm text-gray-600">
                        {format(parseISO(session.session_date), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                    <div className="text-right">
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
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Transações Recentes</h2>
              <DollarSign className="h-5 w-5 text-gray-400" />
            </div>
          </div>
          <div className="p-6">
            {recentTransactions.length > 0 ? (
              <div className="space-y-4">
                {recentTransactions.map((transaction) => (
                  <div key={transaction.id} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
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
                      <div>
                        <p className="font-medium text-gray-900">
                          {transaction.patients?.full_name || transaction.description}
                        </p>
                        <p className="text-sm text-gray-600">
                          {format(new Date(transaction.transaction_date), 'dd/MM/yyyy')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
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

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Ações Rápidas</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="flex items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-emerald-500 hover:bg-emerald-50 transition-colors group">
            <div className="text-center">
              <Users className="h-8 w-8 text-gray-400 group-hover:text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-600 group-hover:text-emerald-600">
                Novo Paciente
              </p>
            </div>
          </button>
          
          <button className="flex items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-green-500 hover:bg-green-50 transition-colors group">
            <div className="text-center">
              <Calendar className="h-8 w-8 text-gray-400 group-hover:text-green-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-600 group-hover:text-green-600">
                Agendar Sessão
              </p>
            </div>
          </button>
          
          <button className="flex items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-yellow-500 hover:bg-yellow-50 transition-colors group">
            <div className="text-center">
              <DollarSign className="h-8 w-8 text-gray-400 group-hover:text-yellow-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-600 group-hover:text-yellow-600">
                Registrar Pagamento
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}

