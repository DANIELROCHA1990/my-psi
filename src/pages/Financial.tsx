import React, { useState, useEffect } from 'react'
import { financialService } from '../services/financialService'
import { patientService } from '../services/patientService'
import { FinancialRecord, Patient } from '../types'
import { Plus, Search, DollarSign, TrendingUp, TrendingDown, Calendar, Edit, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

export default function Financial() {
  const [records, setRecords] = useState<FinancialRecord[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingRecord, setEditingRecord] = useState<FinancialRecord | null>(null)
  const [stats, setStats] = useState({
    weeklyRevenue: 0,
    monthlyRevenue: 0,
    weeklyExpenses: 0,
    monthlyExpenses: 0
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [recordsData, patientsData, weeklyRevenue, monthlyRevenue] = await Promise.all([
        financialService.getFinancialRecords(),
        patientService.getPatients(),
        financialService.getWeeklyRevenue(),
        financialService.getMonthlyRevenue()
      ])
      
      setRecords(recordsData)
      setPatients(patientsData)
      
      // Calculate expenses
      const weekStart = startOfWeek(new Date())
      const weekEnd = endOfWeek(new Date())
      const monthStart = startOfMonth(new Date())
      const monthEnd = endOfMonth(new Date())
      
      const weeklyExpenses = recordsData
        .filter(r => r.transaction_type === 'expense' && 
                new Date(r.transaction_date) >= weekStart && 
                new Date(r.transaction_date) <= weekEnd)
        .reduce((sum, r) => sum + Number(r.amount), 0)
      
      const monthlyExpenses = recordsData
        .filter(r => r.transaction_type === 'expense' && 
                new Date(r.transaction_date) >= monthStart && 
                new Date(r.transaction_date) <= monthEnd)
        .reduce((sum, r) => sum + Number(r.amount), 0)
      
      setStats({
        weeklyRevenue,
        monthlyRevenue,
        weeklyExpenses,
        monthlyExpenses
      })
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

  const filteredRecords = records.filter(record =>
    record.patients?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.payment_method.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Prepare chart data
  const chartData = records.reduce((acc, record) => {
    const month = format(new Date(record.transaction_date), 'MMM', { locale: ptBR })
    const existing = acc.find(item => item.month === month)
    
    if (existing) {
      if (record.transaction_type === 'income') {
        existing.receita += Number(record.amount)
      } else {
        existing.despesa += Number(record.amount)
      }
    } else {
      acc.push({
        month,
        receita: record.transaction_type === 'income' ? Number(record.amount) : 0,
        despesa: record.transaction_type === 'expense' ? Number(record.amount) : 0
      })
    }
    
    return acc
  }, [] as any[])

  const pieData = [
    { name: 'Receitas', value: stats.monthlyRevenue, color: '#10b981' },
    { name: 'Despesas', value: stats.monthlyExpenses, color: '#ef4444' }
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Financeiro</h1>
          <p className="text-gray-600 mt-2">Controle suas receitas e despesas.</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <Plus className="h-5 w-5" />
          Nova Transação
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="bg-green-50 p-3 rounded-lg">
              <TrendingUp className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Receita Semanal</p>
              <p className="text-2xl font-bold text-gray-900">
                R$ {stats.weeklyRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="bg-blue-50 p-3 rounded-lg">
              <DollarSign className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Receita Mensal</p>
              <p className="text-2xl font-bold text-gray-900">
                R$ {stats.monthlyRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="bg-red-50 p-3 rounded-lg">
              <TrendingDown className="h-6 w-6 text-red-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Despesas Semanais</p>
              <p className="text-2xl font-bold text-gray-900">
                R$ {stats.weeklyExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="bg-purple-50 p-3 rounded-lg">
              <Calendar className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Saldo Mensal</p>
              <p className={`text-2xl font-bold ${
                (stats.monthlyRevenue - stats.monthlyExpenses) >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                R$ {(stats.monthlyRevenue - stats.monthlyExpenses).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Receitas vs Despesas</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value) => `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
              <Bar dataKey="receita" fill="#10b981" name="Receitas" />
              <Bar dataKey="despesa" fill="#ef4444" name="Despesas" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Distribuição Mensal</h3>
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
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
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
                    <div>
                      <h3 className="font-medium text-gray-900">
                        {record.patients?.full_name || record.description}
                      </h3>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span>{format(new Date(record.transaction_date), 'dd/MM/yyyy')}</span>
                        <span className="capitalize">{record.payment_method}</span>
                        {record.category && <span>{record.category}</span>}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-right">
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
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
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
                className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
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
      <div className="bg-white rounded-xl max-w-lg w-full">
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Salvando...' : (record ? 'Atualizar' : 'Criar')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}