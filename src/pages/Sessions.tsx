import React, { useState, useEffect } from 'react'
import { sessionService } from '../services/sessionService'
import { patientService } from '../services/patientService'
import { Session, Patient } from '../types'
import { Plus, Search, Edit, Trash2, Calendar, Clock, User, DollarSign, FileText } from 'lucide-react'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default function Sessions() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingSession, setEditingSession] = useState<Session | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('all')

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

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta sessão?')) return

    try {
      await sessionService.deleteSession(id)
      setSessions(prev => prev.filter(s => s.id !== id))
      toast.success('Sessão excluída com sucesso')
    } catch (error) {
      toast.error('Erro ao excluir sessão')
    }
  }

  const filteredSessions = sessions.filter(session => {
    const matchesSearch = session.patients?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         session.session_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         session.summary?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = filterStatus === 'all' || session.payment_status === filterStatus
    return matchesSearch && matchesStatus
  })

  const stats = {
    total: sessions.length,
    upcoming: sessions.filter(s => parseISO(s.session_date) > new Date()).length,
    completed: sessions.filter(s => parseISO(s.session_date) < new Date()).length,
    paid: sessions.filter(s => s.payment_status === 'paid').length
  }

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
          <h1 className="text-3xl font-bold text-gray-900">Sessões</h1>
          <p className="text-gray-600 mt-2">Gerencie suas sessões de terapia.</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <Plus className="h-5 w-5" />
          Nova Sessão
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="bg-blue-50 p-3 rounded-lg">
              <Calendar className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total de Sessões</p>
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
              <p className="text-sm font-medium text-gray-600">Próximas</p>
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
              placeholder="Buscar sessões..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">Todos os Status</option>
            <option value="pending">Pendente</option>
            <option value="paid">Pago</option>
            <option value="cancelled">Cancelado</option>
          </select>
        </div>
      </div>

      {/* Sessions List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Lista de Sessões ({filteredSessions.length})
          </h2>
        </div>
        
        {filteredSessions.length > 0 ? (
          <div className="divide-y divide-gray-200">
            {filteredSessions.map((session) => (
              <div key={session.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-4">
                        <h3 className="text-lg font-medium text-gray-900">
                          {session.patients?.full_name}
                        </h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          session.payment_status === 'paid' 
                            ? 'bg-green-100 text-green-800'
                            : session.payment_status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {session.payment_status === 'paid' ? 'Pago' : 
                           session.payment_status === 'pending' ? 'Pendente' : 'Cancelado'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Calendar className="h-4 w-4" />
                        {format(parseISO(session.session_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Clock className="h-4 w-4" />
                        {format(parseISO(session.session_date), 'HH:mm')} 
                        {session.duration_minutes && ` (${session.duration_minutes} min)`}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <FileText className="h-4 w-4" />
                        {session.session_type || 'Sessão Individual'}
                      </div>
                    </div>
                    
                    {session.summary && (
                      <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                        {session.summary}
                      </p>
                    )}
                    
                    {session.session_price && (
                      <div className="text-sm font-medium text-gray-900">
                        Valor: R$ {Number(session.session_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => setEditingSession(session)}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Editar sessão"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(session.id)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Excluir sessão"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Calendar className="h-12 w-12 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm || filterStatus !== 'all' ? 'Nenhuma sessão encontrada' : 'Nenhuma sessão agendada'}
            </h3>
            <p className="text-gray-600 mb-6">
              {searchTerm || filterStatus !== 'all' 
                ? 'Tente ajustar os filtros da sua busca.' 
                : 'Comece agendando sua primeira sessão.'
              }
            </p>
            {!searchTerm && filterStatus === 'all' && (
              <button
                onClick={() => setShowAddForm(true)}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Agendar Primeira Sessão
              </button>
            )}
          </div>
        )}
      </div>

      {/* Add/Edit Session Modal */}
      {(showAddForm || editingSession) && (
        <SessionModal
          session={editingSession}
          patients={patients}
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

// Session Modal Component
function SessionModal({ 
  session, 
  patients,
  onClose, 
  onSave 
}: { 
  session: Session | null
  patients: Patient[]
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
    session_type: session?.session_type || 'Sessão Individual',
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
  
  // Atualizar preço quando paciente for selecionado
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
      toast.error('Paciente e data são obrigatórios')
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
        toast.success('Sessão atualizada com sucesso')
      } else {
        await sessionService.createSession(sessionData as any)
        toast.success('Sessão criada com sucesso')
      }

      onSave()
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar sessão')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {session ? 'Editar Sessão' : 'Nova Sessão'}
          </h2>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Information */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Informações Básicas</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Paciente *
                </label>
                <select
                  required
                  value={formData.patient_id}
                  onChange={(e) => handlePatientChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Duração (minutos)
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.duration_minutes}
                  onChange={(e) => setFormData(prev => ({ ...prev, duration_minutes: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo de Sessão
                </label>
                <select
                  value={formData.session_type}
                  onChange={(e) => setFormData(prev => ({ ...prev, session_type: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="Sessão Individual">Sessão Individual</option>
                  <option value="Sessão em Grupo">Sessão em Grupo</option>
                  <option value="Sessão Familiar">Sessão Familiar</option>
                  <option value="Avaliação">Avaliação</option>
                  <option value="Retorno">Retorno</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Valor da Sessão (R$) {selectedPatient && '(Valor fixo do paciente)'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.session_price}
                  onChange={(e) => setFormData(prev => ({ ...prev, session_price: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder={selectedPatient ? `Valor padrão: R$ ${selectedPatient.session_price?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}` : 'Digite o valor'}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Status do Pagamento
                </label>
                <select
                  value={formData.payment_status}
                  onChange={(e) => setFormData(prev => ({ ...prev, payment_status: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
            <h3 className="text-lg font-medium text-gray-900 mb-4">Detalhes da Sessão</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Resumo da Sessão
                </label>
                <textarea
                  rows={4}
                  value={formData.summary}
                  onChange={(e) => setFormData(prev => ({ ...prev, summary: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Resumo dos principais pontos abordados na sessão..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Anotações da Sessão
                </label>
                <textarea
                  rows={3}
                  value={formData.session_notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, session_notes: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Observações e anotações importantes..."
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Humor Antes da Sessão
                  </label>
                  <input
                    type="text"
                    value={formData.mood_before}
                    onChange={(e) => setFormData(prev => ({ ...prev, mood_before: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Ex: Ansioso, Calmo, Irritado..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Humor Após a Sessão
                  </label>
                  <input
                    type="text"
                    value={formData.mood_after}
                    onChange={(e) => setFormData(prev => ({ ...prev, mood_after: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Ex: Mais calmo, Reflexivo, Motivado..."
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tarefa/Exercício Atribuído
                </label>
                <textarea
                  rows={2}
                  value={formData.homework_assigned}
                  onChange={(e) => setFormData(prev => ({ ...prev, homework_assigned: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Exercícios ou tarefas para realizar até a próxima sessão..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Próxima Sessão
                </label>
                <input
                  type="datetime-local"
                  value={formData.next_session_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, next_session_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Salvando...' : (session ? 'Atualizar' : 'Criar')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}