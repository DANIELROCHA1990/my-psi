import React, { useState, useEffect } from 'react'
import { patientService } from '../services/patientService'
import { sessionService } from '../services/sessionService'
import { Patient } from '../types'
import { Plus, Search, Edit, Trash2, User, Phone, Mail, MapPin, Calendar, Activity, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default function Patients() {
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null)

  useEffect(() => {
    loadPatients()
  }, [])

  const loadPatients = async () => {
    try {
      setLoading(true)
      const data = await patientService.getPatients()
      setPatients(data)
    } catch (error) {
      toast.error('Erro ao carregar pacientes')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este paciente?')) return

    try {
      const { error } = await patientService.deletePatient(id)
      if (error) throw error
      
      setPatients(prev => prev.filter(p => p.id !== id))
      toast.success('Paciente excluído com sucesso')
    } catch (error) {
      toast.error('Erro ao excluir paciente')
    }
  }

  const filteredPatients = patients.filter(patient =>
    patient.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    patient.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    patient.phone?.includes(searchTerm)
  )

  const activePatients = patients.filter(p => p.active).length
  const totalPatients = patients.length

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
          <h1 className="text-3xl font-bold text-gray-900">Pacientes</h1>
          <p className="text-gray-600 mt-2">Gerencie seus pacientes e suas informações.</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2"
        >
          <Plus className="h-5 w-5" />
          Novo Paciente
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="bg-emerald-50 p-3 rounded-lg">
              <User className="h-6 w-6 text-emerald-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total de Pacientes</p>
              <p className="text-3xl font-bold text-gray-900">{totalPatients}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="bg-green-50 p-3 rounded-lg">
              <Activity className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Pacientes Ativos</p>
              <p className="text-3xl font-bold text-gray-900">{activePatients}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="bg-yellow-50 p-3 rounded-lg">
              <Calendar className="h-6 w-6 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Novos este Mês</p>
              <p className="text-3xl font-bold text-gray-900">
                {patients.filter(p => {
                  const createdAt = new Date(p.created_at || '')
                  const now = new Date()
                  return createdAt.getMonth() === now.getMonth() && createdAt.getFullYear() === now.getFullYear()
                }).length}
              </p>
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
            placeholder="Buscar pacientes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Patients List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Lista de Pacientes ({filteredPatients.length})
          </h2>
        </div>
        
        {filteredPatients.length > 0 ? (
          <div className="divide-y divide-gray-200">
            {filteredPatients.map((patient) => (
              <div key={patient.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="bg-emerald-100 rounded-full p-3">
                      <User className="h-6 w-6 text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                        {patient.full_name}
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          patient.active 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {patient.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </h3>
                      <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
                        {patient.email && (
                          <div className="flex items-center gap-1">
                            <Mail className="h-4 w-4" />
                            {patient.email}
                          </div>
                        )}
                        {patient.phone && (
                          <div className="flex items-center gap-1">
                            <Phone className="h-4 w-4" />
                            {patient.phone}
                          </div>
                        )}
                        {patient.city && (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-4 w-4" />
                            {patient.city}
                          </div>
                        )}
                      </div>
                      {patient.created_at && (
                        <p className="text-xs text-gray-500 mt-1">
                          Cadastrado em {format(new Date(patient.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingPatient(patient)}
                      className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                      title="Editar paciente"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(patient.id)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Excluir paciente"
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
              <User className="h-12 w-12 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? 'Nenhum paciente encontrado' : 'Nenhum paciente cadastrado'}
            </h3>
            <p className="text-gray-600 mb-6">
              {searchTerm 
                ? 'Tente ajustar os termos da sua busca.' 
                : 'Comece cadastrando seu primeiro paciente.'
              }
            </p>
            {!searchTerm && (
              <button
                onClick={() => setShowAddForm(true)}
                className="bg-emerald-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-emerald-700 transition-colors"
              >
                Cadastrar Primeiro Paciente
              </button>
            )}
          </div>
        )}
      </div>

      {/* Add/Edit Patient Modal */}
      {(showAddForm || editingPatient) && (
        <PatientModal
          patient={editingPatient}
          onClose={() => {
            setShowAddForm(false)
            setEditingPatient(null)
          }}
          onSave={() => {
            loadPatients()
            setShowAddForm(false)
            setEditingPatient(null)
          }}
        />
      )}
    </div>
  )
}

// Patient Modal Component
function PatientModal({ 
  patient, 
  onClose, 
  onSave 
}: { 
  patient: Patient | null
  onClose: () => void
  onSave: () => void
}) {
  const [formData, setFormData] = useState({
    full_name: patient?.full_name || '',
    email: patient?.email || '',
    phone: patient?.phone || '',
    address: patient?.address || '',
    birth_date: patient?.birth_date || '',
    cpf: patient?.cpf || '',
    city: patient?.city || '',
    state: patient?.state || '',
    zip_code: patient?.zip_code || '',
    emergency_contact: patient?.emergency_contact || '',
    emergency_phone: patient?.emergency_phone || '',
    medical_history: patient?.medical_history || '',
    current_medications: patient?.current_medications || '',
    therapy_goals: patient?.therapy_goals || '',
    session_frequency: patient?.session_frequency || 'weekly',
    session_price: patient?.session_price?.toString() || '',
    active: patient?.active ?? true
  })
  
  const [sessionSchedules, setSessionSchedules] = useState<Array<{
    dayOfWeek: number,
    time: string,
    paymentStatus: 'paid' | 'pending'
  }>>([])
  
  const isNewPatient = !patient
  const [manageAutoSessions, setManageAutoSessions] = useState(isNewPatient)
  const [loading, setLoading] = useState(false)
  
  const daysOfWeek = [
    { value: 1, label: 'Segunda-feira' },
    { value: 2, label: 'Terça-feira' },
    { value: 3, label: 'Quarta-feira' },
    { value: 4, label: 'Quinta-feira' },
    { value: 5, label: 'Sexta-feira' },
    { value: 6, label: 'Sábado' },
    { value: 0, label: 'Domingo' }
  ]
  
  const addSchedule = () => {
    setSessionSchedules([...sessionSchedules, {
      dayOfWeek: 1,
      time: '09:00',
      paymentStatus: 'pending'
    }])
  }
  
  const removeSchedule = (index: number) => {
    setSessionSchedules(sessionSchedules.filter((_, i) => i !== index))
  }
  
  const updateSchedule = (index: number, field: string, value: any) => {
    const updated = [...sessionSchedules]
    updated[index] = { ...updated[index], [field]: value }
    setSessionSchedules(updated)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.full_name.trim()) {
      toast.error('Nome é obrigatório')
      return
    }
    
    setLoading(true)

    try {
      const patientData = {
        ...formData,
        session_price: formData.session_price ? Number(formData.session_price) : undefined,
        birth_date: formData.birth_date || undefined,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        address: formData.address || undefined,
        cpf: formData.cpf || undefined,
        city: formData.city || undefined,
        state: formData.state || undefined,
        zip_code: formData.zip_code || undefined,
        emergency_contact: formData.emergency_contact || undefined,
        emergency_phone: formData.emergency_phone || undefined,
        medical_history: formData.medical_history || undefined,
        current_medications: formData.current_medications || undefined,
        therapy_goals: formData.therapy_goals || undefined
      }

      if (patient) {
        const { error } = await patientService.updatePatient(patient.id, patientData)
        if (error) throw error

        if (manageAutoSessions && sessionSchedules.length > 0) {
          try {
            await sessionService.replaceFutureSessions(
              patient.id,
              sessionSchedules,
              12
            )
            toast.success('Paciente e sessões atualizados com sucesso')
          } catch (sessionError) {
            toast.error('Paciente atualizado, mas erro ao atualizar sessões')
          }
        } else {
          toast.success('Paciente atualizado com sucesso')
        }
      } else {
        const { data: newPatient, error } = await patientService.createPatient(patientData as any)
        if (error) throw error
        
        // Se deve criar sessões automaticamente
        if (manageAutoSessions && sessionSchedules.length > 0) {
          try {
            await sessionService.createMultipleSessions(
              newPatient?.id || '',
              sessionSchedules,
              12 // Criar sessões para 12 semanas
            )
            toast.success('Paciente e sessões criados com sucesso')
          } catch (sessionError) {
            toast.error('Paciente criado, mas erro ao criar sessões')
          }
        } else {
          toast.success('Paciente criado com sucesso')
        }
      }

      onSave()
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar paciente')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {patient ? 'Editar Paciente' : 'Novo Paciente'}
          </h2>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Information */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Informações Básicas</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={formData.full_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Data de Nascimento
                </label>
                <input
                  type="date"
                  value={formData.birth_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, birth_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Telefone
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  CPF
                </label>
                <input
                  type="text"
                  value={formData.cpf}
                  onChange={(e) => setFormData(prev => ({ ...prev, cpf: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="000.000.000-00"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Status
                </label>
                <select
                  value={formData.active ? 'true' : 'false'}
                  onChange={(e) => setFormData(prev => ({ ...prev, active: e.target.value === 'true' }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="true">Ativo</option>
                  <option value="false">Inativo</option>
                </select>
              </div>
            </div>
          </div>
          
          {/* Address */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Endereço</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Endereço
                </label>
                <textarea
                  rows={2}
                  value={formData.address}
                  onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="Rua, número, complemento..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cidade
                </label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Estado
                </label>
                <input
                  type="text"
                  value={formData.state}
                  onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="Ex: SP, RJ, MG..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  CEP
                </label>
                <input
                  type="text"
                  value={formData.zip_code}
                  onChange={(e) => setFormData(prev => ({ ...prev, zip_code: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="00000-000"
                />
              </div>
            </div>
          </div>
          
          {/* Emergency Contact */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Contato de Emergência</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nome do Contato
                </label>
                <input
                  type="text"
                  value={formData.emergency_contact}
                  onChange={(e) => setFormData(prev => ({ ...prev, emergency_contact: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Telefone de Emergência
                </label>
                <input
                  type="tel"
                  value={formData.emergency_phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, emergency_phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
            </div>
          </div>
          
          {/* Clinical Information */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Informações Clínicas</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Histórico Médico
                </label>
                <textarea
                  rows={3}
                  value={formData.medical_history}
                  onChange={(e) => setFormData(prev => ({ ...prev, medical_history: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="Histórico médico relevante..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Medicações Atuais
                </label>
                <textarea
                  rows={2}
                  value={formData.current_medications}
                  onChange={(e) => setFormData(prev => ({ ...prev, current_medications: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="Medicações em uso..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Objetivos da Terapia
                </label>
                <textarea
                  rows={3}
                  value={formData.therapy_goals}
                  onChange={(e) => setFormData(prev => ({ ...prev, therapy_goals: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="Objetivos e metas da terapia..."
                />
              </div>
            </div>
          </div>
          
          {/* Session Settings */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Configurações de Sessão</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Frequência das Sessões
                </label>
                <select
                  value={formData.session_frequency}
                  onChange={(e) => setFormData(prev => ({ ...prev, session_frequency: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="weekly">Semanal</option>
                  <option value="biweekly">Quinzenal</option>
                  <option value="monthly">Mensal</option>
                  <option value="as_needed">Conforme necessário</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Valor Fixo da Sessão (R$) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={formData.session_price}
                  onChange={(e) => setFormData(prev => ({ ...prev, session_price: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="Valor que será usado em todas as sessões"
                />
              </div>
            </div>
          </div>
          
          {/* Automatic Session Creation */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                {isNewPatient ? 'Criação Automática de Sessões' : 'Atualizar Sessões Automáticas'}
              </h3>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={manageAutoSessions}
                  onChange={(e) => setManageAutoSessions(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>
            
            {manageAutoSessions && (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  {isNewPatient
                    ? 'Configure os dias e horários das sessões. Serão criadas automaticamente sessões para as próximas 12 semanas.'
                    : 'Ao salvar, as sessões futuras não pagas deste paciente serão substituídas pelas novas datas (12 semanas).'}
                </p>
                
                {sessionSchedules.map((schedule, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 border border-gray-200 rounded-lg">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Dia da Semana
                      </label>
                      <select
                        value={schedule.dayOfWeek}
                        onChange={(e) => updateSchedule(index, 'dayOfWeek', Number(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      >
                        {daysOfWeek.map(day => (
                          <option key={day.value} value={day.value}>
                            {day.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Horário
                      </label>
                      <input
                        type="time"
                        value={schedule.time}
                        onChange={(e) => updateSchedule(index, 'time', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Status de Pagamento
                      </label>
                      <select
                        value={schedule.paymentStatus}
                        onChange={(e) => updateSchedule(index, 'paymentStatus', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      >
                        <option value="pending">Pendente</option>
                        <option value="paid">Pago</option>
                      </select>
                    </div>
                    
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => removeSchedule(index)}
                        className="w-full px-3 py-2 text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                ))}
                
                <button
                  type="button"
                  onClick={addSchedule}
                  className="w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-emerald-500 hover:text-emerald-600 transition-colors flex items-center justify-center gap-2"
                >
                  <Clock className="h-4 w-4" />
                  Adicionar Horário de Sessão
                </button>
              </div>
            )}
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
              {loading ? 'Salvando...' : (patient ? 'Atualizar' : 'Criar')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

