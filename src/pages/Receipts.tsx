import React, { useState, useEffect } from 'react'
import { patientService } from '../services/patientService'
import { sessionService } from '../services/sessionService'
import { Patient, Session } from '../types'
import { FileText, Search, Download, Send, Calendar, User, DollarSign, CheckCircle, Clock, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

/**
 * 🔧 Utilitário: Converte uma string de data (com ou sem timezone) para um objeto Date local
 * Isso garante que sempre trabalhemos com datas locais, ignorando qualquer informação de timezone.
 */
function parseLocalDate(dateString: string): Date {
  if (!dateString) return new Date()
  
  // Remove qualquer informação de timezone (Z, +00:00, etc.)
  const cleanDateString = dateString.replace(/[Z]|[+-]\d{2}:\d{2}$/g, '')
  
  // Se a string não tem horário, adiciona 00:00:00
  const fullDateString = cleanDateString.includes('T') 
    ? cleanDateString 
    : `${cleanDateString}T00:00:00`
  
  // Cria o Date usando o construtor que interpreta como horário local
  return new Date(fullDateString)
}

interface Receipt {
  id: string
  patient: Patient
  session: Session
  amount: number
  issueDate: string
  status: 'pending' | 'generated' | 'sent'
  receiptNumber: string
}

export default function Receipts() {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [patientsData, sessionsData] = await Promise.all([
        patientService.getPatients(),
        sessionService.getSessions()
      ])
      
      setPatients(patientsData)
      setSessions(sessionsData)
      
      // Generate mock receipts from paid sessions
      const mockReceipts: Receipt[] = sessionsData
        .filter(session => session.payment_status === 'paid' && session.session_price)
        .map((session, index) => ({
          id: `receipt-${session.id}`,
          patient: patientsData.find(p => p.id === session.patient_id)!,
          session,
          amount: session.session_price!,
          issueDate: session.session_date,
          status: index % 3 === 0 ? 'sent' : index % 3 === 1 ? 'generated' : 'pending',
          receiptNumber: `REC-${String(index + 1).padStart(4, '0')}`
        }))
        .filter(receipt => receipt.patient)
      
      setReceipts(mockReceipts)
    } catch (error) {
      toast.error('Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateReceipt = async (receiptId: string) => {
    try {
      // Mock receipt generation
      setReceipts(prev => prev.map(receipt => 
        receipt.id === receiptId 
          ? { ...receipt, status: 'generated' as const }
          : receipt
      ))
      toast.success('Recibo gerado com sucesso')
    } catch (error) {
      toast.error('Erro ao gerar recibo')
    }
  }

  const handleSendReceipt = async (receiptId: string) => {
    try {
      // Mock receipt sending
      setReceipts(prev => prev.map(receipt => 
        receipt.id === receiptId 
          ? { ...receipt, status: 'sent' as const }
          : receipt
      ))
      toast.success('Recibo enviado com sucesso')
    } catch (error) {
      toast.error('Erro ao enviar recibo')
    }
  }

  const handleDownloadReceipt = (receipt: Receipt) => {
    // Mock download functionality
    toast.success(`Download do recibo ${receipt.receiptNumber} iniciado`)
  }

  const filteredReceipts = receipts.filter(receipt => {
    const matchesSearch = receipt.patient.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         receipt.receiptNumber.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = filterStatus === 'all' || receipt.status === filterStatus
    return matchesSearch && matchesStatus
  })

  const stats = {
    total: receipts.length,
    pending: receipts.filter(r => r.status === 'pending').length,
    generated: receipts.filter(r => r.status === 'generated').length,
    sent: receipts.filter(r => r.status === 'sent').length
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
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Recibos</h1>
        <p className="text-gray-600 mt-2">Gerencie e envie recibos para seus pacientes.</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="bg-blue-50 p-3 rounded-lg">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total de Recibos</p>
              <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="bg-yellow-50 p-3 rounded-lg">
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Pendentes</p>
              <p className="text-3xl font-bold text-gray-900">{stats.pending}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="bg-orange-50 p-3 rounded-lg">
              <AlertCircle className="h-6 w-6 text-orange-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Gerados</p>
              <p className="text-3xl font-bold text-gray-900">{stats.generated}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="bg-green-50 p-3 rounded-lg">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Enviados</p>
              <p className="text-3xl font-bold text-gray-900">{stats.sent}</p>
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
              placeholder="Buscar recibos..."
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
            <option value="pending">Pendentes</option>
            <option value="generated">Gerados</option>
            <option value="sent">Enviados</option>
          </select>
        </div>
      </div>

      {/* Receipts List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Lista de Recibos ({filteredReceipts.length})
          </h2>
        </div>
        
        {filteredReceipts.length > 0 ? (
          <div className="divide-y divide-gray-200">
            {filteredReceipts.map((receipt) => (
              <div key={receipt.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-4">
                        <h3 className="text-lg font-medium text-gray-900">
                          {receipt.receiptNumber}
                        </h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          receipt.status === 'sent' 
                            ? 'bg-green-100 text-green-800'
                            : receipt.status === 'generated'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {receipt.status === 'sent' ? 'Enviado' : 
                           receipt.status === 'generated' ? 'Gerado' : 'Pendente'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <User className="h-4 w-4" />
                        {receipt.patient.full_name}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Calendar className="h-4 w-4" />
                        {format(parseLocalDate(receipt.issueDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <DollarSign className="h-4 w-4" />
                        R$ {receipt.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    
                    <div className="text-xs text-gray-500">
                      Sessão: {format(parseLocalDate(receipt.session.session_date), 'dd/MM/yyyy HH:mm')} - {receipt.session.session_type}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 ml-4">
                    {receipt.status === 'pending' && (
                      <button
                        onClick={() => handleGenerateReceipt(receipt.id)}
                        className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Gerar
                      </button>
                    )}
                    
                    {receipt.status === 'generated' && (
                      <>
                        <button
                          onClick={() => handleDownloadReceipt(receipt)}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleSendReceipt(receipt.id)}
                          className="px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                          Enviar
                        </button>
                      </>
                    )}
                    
                    {receipt.status === 'sent' && (
                      <button
                        onClick={() => handleDownloadReceipt(receipt)}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Download"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="h-12 w-12 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm || filterStatus !== 'all' ? 'Nenhum recibo encontrado' : 'Nenhum recibo disponível'}
            </h3>
            <p className="text-gray-600">
              {searchTerm || filterStatus !== 'all' 
                ? 'Tente ajustar os filtros da sua busca.' 
                : 'Os recibos aparecerão aqui quando você tiver sessões pagas.'
              }
            </p>
          </div>
        )}
      </div>

      {/* Pending Actions Alert */}
      {stats.pending > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
          <div className="flex items-center">
            <AlertCircle className="h-6 w-6 text-yellow-600 mr-3" />
            <div>
              <h3 className="text-lg font-medium text-yellow-800">
                Ação Necessária
              </h3>
              <p className="text-yellow-700 mt-1">
                Você tem {stats.pending} recibo{stats.pending > 1 ? 's' : ''} pendente{stats.pending > 1 ? 's' : ''} para gerar.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}