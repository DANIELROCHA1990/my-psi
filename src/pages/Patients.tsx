import React, { useState, useEffect } from 'react'
import { patientService } from '../services/patientService'
import { sessionService } from '../services/sessionService'
import { Patient, SessionSchedule } from '../types'
import { Plus, Search, Edit, UserX, UserCheck, User, Phone, Mail, MapPin, Calendar, Activity, Clock, FileText } from 'lucide-react'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import { normalizeSearchText } from '../lib/search'
import { ptBR } from 'date-fns/locale'
import { jsPDF } from 'jspdf'

export default function Patients() {
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null)
  const [reactivateMode, setReactivateMode] = useState(false)

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

  const handleDeactivate = async (patient: Patient) => {
    if (!patient.active) {
      toast.error('Paciente já está inativo')
      return
    }

    if (!confirm('Tem certeza que deseja inativar este paciente? As sessões e lançamentos financeiros futuros serão apagados.')) return

    try {
      const { error } = await patientService.deactivatePatient(patient.id)
      if (error) throw error
      
      setPatients(prev => prev.map(p => p.id === patient.id ? { ...p, active: false } : p))
      toast.success('Paciente inativado com sucesso')
    } catch (error) {
      toast.error('Erro ao inativar paciente')
    }
  }

  const handleActivate = (patient: Patient) => {
    setReactivateMode(true)
    setEditingPatient({ ...patient, active: true })
  }

  const normalizedSearch = normalizeSearchText(searchTerm.trim())

  const filteredPatients = patients.filter(patient =>
    normalizeSearchText(patient.full_name).includes(normalizedSearch) ||
    normalizeSearchText(patient.email || '').includes(normalizedSearch) ||
    (patient.phone || '').includes(searchTerm.trim())
  )

  const activePatients = patients.filter(p => p.active).length
  const totalPatients = patients.length

  const contractDaysOfWeek = [
    { value: 0, label: 'Domingo' },
    { value: 1, label: 'Segunda-feira' },
    { value: 2, label: 'Terca-feira' },
    { value: 3, label: 'Quarta-feira' },
    { value: 4, label: 'Quinta-feira' },
    { value: 5, label: 'Sexta-feira' },
    { value: 6, label: 'Sabado' }
  ]

  const frequencyLabels: Record<string, string> = {
    weekly: 'Semanal',
    biweekly: 'Quinzenal',
    monthly: 'Mensal',
    as_needed: 'Conforme necessario'
  }

  const paymentStatusLabels: Record<string, string> = {
    paid: 'Pago',
    pending: 'Pendente',
    cancelled: 'Cancelado'
  }

  const contractClauses = [
    '1. O processo de psicoterapia iniciara a partir da autorizacao de um(a) dos(as) responsaveis da crianca ou adolescente. O processo se dara em medio a longo prazo. Afirma-se o sigilo profissional dos atendimentos, no qual nao ha violacao dos dados, ou seja, informacoes obtidas nos atendimentos com o(a) paciente para outrem. (Com excecao em casos do(a) paciente colocar a propria vida em risco ou de outrem).',
    '2. O processo deve ser iniciado a partir da entrevista com pais e/ou responsaveis da crianca ou adolescente, recolhendo as principais informacoes e os motivos para iniciar o processo. As entrevistas com os pais e/ou responsaveis deve ser realizada de forma periodica a medida que a profissional sinta necessidade, ou ainda que os proprios responsaveis do(a) paciente solicitem.',
    '2.1. O atendimento com os responsaveis do(a) adolescente acontecera mediante aos acordos feitos entre paciente e a profissional, caso lhe for pertinente.',
    '3. Os atendimentos terao frequencia de, no minimo, uma vez por semana, em horario e dia preestabelecidos por todas as partes. Podendo passar por alteracoes e/ou aumento de sessoes semanais, caso haja necessidade clinica.',
    '4. O valor das sessoes sera definido pela profissional, mas podera passar por alteracoes no decorrer do processo a medida que as partes sintam a necessidade de modificar.',
    '5. O valor da sessao sofrera reajuste anual de 10%, acordado em contrato com o(s) responsavel(eis), acontecendo no inicio de cada ano ou a cada ano de acompanhamento.',
    '6. O pagamento das sessoes e definido pela profissional, sendo tambem um combinado entre as partes, podendo sofrer ou nao alteracao, como informado no item 3 e 4.',
    '7. As faltas, os atrasos e as interrupcoes do processo devem ser avisadas com antecedencia a profissional, para que nao prejudique o processo do(a) paciente. E possivel que, diante das dificuldades de permanencia, seja necessario encaminhar o(a) paciente para outro(a) profissional.',
    '8. A profissional avisara com antecedencia em caso de faltas ou atrasos. Assim, disponibilizando-se para a reposicao dos atendimentos e das horas, sem onus da sessao de reposicao.',
    '9. Faltas serao cobradas, com ou sem aviso previo, faltas informadas antes de 24 horas poderao realizar reposicao sem custo adicional, caso seja avisado dentro das 24h da sessao, a sessao de reposicao sera cobrada como sessao extra.',
    '10. A profissional avisara com antecedencia quando lhe couber tirar ferias ou recesso, tendo, portanto, breve interrupcao dos atendimentos/pagamentos. As ferias podem ocorrer uma ou duas vezes ao ano, no mes de julho e/ou no mes de dezembro (recesso das festas e dos feriados de final de ano). No entanto, podem ocorrer modificacoes caso o processo possa sofrer prejuizos com a interrupcao ocasionada por ferias ou recesso. As sessoes que nao ocorrerem devido as ferias da profissional nao serao cobradas.',
    '11. Em caso de ferias escolares, as sessoes nao sofrem mudanca, sendo estas permanecendo em seu horario reservado preservado, com os mesmos combinados em contrato.',
    '12. E de suma importancia a presenca semanal do(a) paciente nas sessoes, sendo repensada a continuidade caso haja pelo menos tres faltas consecutivas. Logo, as entrevistas periodicas com os pais tambem sao realizadas pelo menos a cada seis a oito sessoes com a crianca ou o adolescente. Essa periodicidade semanal dos atendimentos com o(a) paciente pode ser repensada, bem como as periodicidades dos atendimentos com a familia.',
    '13. Os atendimentos duram em torno de, no minimo, 45 minutos. Em caso de atrasos do(a) paciente, o tempo nao sera alterado, sendo utilizado o tempo restante da sessao. Em caso de a profissional atrasar, o tempo do paciente nao e prejudicado, sendo reposto na mesma sessao ou em outras, seguintes.',
    '14. Em caso de interrupcao do processo, e relevante que sejam realizadas sessoes para facilitar o processo de desligamento da crianca ou adolescente, como tambem a realizacao de pelo menos uma sessao com os pais e/ou responsaveis.',
    '15. Em caso de necessidade de outros acompanhamentos, a profissional podera realizar encaminhamentos para outros especialistas com o intuito de complementar e ampliar o cuidado do(a) paciente, bem como encaminhamentos direcionados aos membros da familia do(a) paciente.',
    '16. A profissional podera ficar autorizada a realizar visitas escolares e/ou contato com outros profissionais que o(a) acompanham, rede de apoio ou membros que fazem parte do ciclo de relacoes da crianca ou adolescente.'
  ]

  const formatBirthDate = (value?: string) => {
    if (!value) {
      return ''
    }
    const parsed = parseISO(value)
    if (Number.isNaN(parsed.getTime())) {
      return value
    }
    return format(parsed, 'dd/MM/yyyy')
  }

  const getDayLabel = (dayOfWeek: number) => {
    return contractDaysOfWeek.find(day => day.value === dayOfWeek)?.label || 'Dia'
  }

  const loadSignatureImage = async (src: string) => {
    const response = await fetch(src)
    if (!response.ok) {
      throw new Error('Erro ao carregar assinatura')
    }
    const blob = await response.blob()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('Erro ao ler assinatura'))
      reader.readAsDataURL(blob)
    })
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Erro ao carregar assinatura'))
      image.src = dataUrl
    })
    return { dataUrl, width: img.width, height: img.height }
  }

  const handleGenerateContract = async (patient: Patient) => {
    const slug = normalizeSearchText(patient.full_name)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
    const fileName = `contrato-${slug || 'paciente'}.pdf`
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
    const margin = 48
    const lineHeight = 16
    const sectionGap = 10
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const maxWidth = pageWidth - margin * 2
    let cursorY = margin
    const signatureImageUrl = new URL('../public/20260111_133550-removebg-preview.png', import.meta.url).toString()
    let signatureImage: { dataUrl: string; width: number; height: number } | null = null

    try {
      signatureImage = await loadSignatureImage(signatureImageUrl)
    } catch (error) {
      signatureImage = null
    }

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(11)
    pdf.setTextColor(0, 0, 0)

    const addPageIfNeeded = (height: number = 0) => {
      if (cursorY + height > pageHeight - margin) {
        pdf.addPage()
        cursorY = margin
      }
    }

    const addWrappedLines = (text: string, indent: number = 0) => {
      const lines = pdf.splitTextToSize(text, maxWidth - indent) as string[]
      lines.forEach((line) => {
        addPageIfNeeded(lineHeight)
        pdf.text(line, margin + indent, cursorY)
        cursorY += lineHeight
      })
    }

    const addTitle = (text: string) => {
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(16)
      const textWidth = pdf.getTextWidth(text)
      addPageIfNeeded(lineHeight)
      pdf.text(text, (pageWidth - textWidth) / 2, cursorY)
      cursorY += lineHeight + 12
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(11)
    }

    const addSectionTitle = (text: string) => {
      addPageIfNeeded(lineHeight * 2)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(12)
      pdf.text(text, margin, cursorY)
      cursorY += lineHeight
      pdf.setDrawColor(220)
      pdf.line(margin, cursorY, pageWidth - margin, cursorY)
      cursorY += sectionGap
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(11)
    }

    addTitle('CONTRATO DE PRESTACAO DE SERVICOS PSICOLOGICOS')

    addSectionTitle('DADOS DO PACIENTE')
    const patientInfoLines = [
      `Nome: ${patient.full_name}`,
      patient.email ? `Email: ${patient.email}` : null,
      patient.phone ? `Telefone: ${patient.phone}` : null,
      formatBirthDate(patient.birth_date) ? `Data de nascimento: ${formatBirthDate(patient.birth_date)}` : null,
      patient.address ? `Endereco: ${patient.address}` : null,
      (patient.city || patient.state) ? `Cidade/UF: ${[patient.city, patient.state].filter(Boolean).join(' - ')}` : null,
      patient.zip_code ? `CEP: ${patient.zip_code}` : null
    ].filter(Boolean) as string[]

    patientInfoLines.forEach((line) => addWrappedLines(line))
    cursorY += sectionGap

    addSectionTitle('CONFIGURACOES DE SESSAO')
    addWrappedLines(`Frequencia: ${frequencyLabels[patient.session_frequency] || patient.session_frequency}`)
    if (patient.session_price !== null && patient.session_price !== undefined) {
      addWrappedLines(`Valor da sessao: R$ ${Number(patient.session_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
    }
    cursorY += sectionGap

    if (patient.session_schedules && patient.session_schedules.length) {
      addSectionTitle('AGENDAMENTOS AUTOMATICOS')
      patient.session_schedules.forEach((schedule) => {
        const pieces = [
          getDayLabel(schedule.dayOfWeek),
          schedule.time
        ]
        if (schedule.sessionType) {
          pieces.push(schedule.sessionType)
        }
        if (schedule.durationMinutes) {
          pieces.push(`${schedule.durationMinutes} min`)
        }
        if (schedule.sessionPrice !== null && schedule.sessionPrice !== undefined) {
          pieces.push(`R$ ${Number(schedule.sessionPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
        }
        if (schedule.paymentStatus) {
          pieces.push(paymentStatusLabels[schedule.paymentStatus] || schedule.paymentStatus)
        }
        addWrappedLines(`- ${pieces.join(' | ')}`, 12)
      })
      cursorY += sectionGap
    }

    addSectionTitle('CLAUSULAS')
    contractClauses.forEach((clause) => {
      addWrappedLines(clause)
      cursorY += 6
    })

    cursorY += sectionGap
    addWrappedLines('Quaisquer duvidas, fico a disposicao para esclarecimentos.')
    cursorY += sectionGap
    addWrappedLines('Local e data: ______________________________')
    cursorY += lineHeight * 2

    const signatureLineWidth = 240
    const signatureLineX = (pageWidth - signatureLineWidth) / 2
    const labelOffset = 14
    const nameOffset = 14
    const signatureGap = 28
    const imageGap = 8
    const imageMaxWidth = signatureLineWidth
    const imageMaxHeight = 56

    const drawSignatureBlock = (
      label: string,
      name: string | null,
      includeImage: boolean
    ) => {
      let imageHeight = 0
      let imageWidth = 0
      if (includeImage && signatureImage) {
        const ratio = signatureImage.width / signatureImage.height
        imageWidth = Math.min(imageMaxWidth, signatureImage.width)
        imageHeight = imageWidth / ratio
        if (imageHeight > imageMaxHeight) {
          imageHeight = imageMaxHeight
          imageWidth = imageHeight * ratio
        }
      }

      const blockHeight = (includeImage && signatureImage ? imageHeight + imageGap : 0)
        + labelOffset
        + (name ? nameOffset : 0)
        + signatureGap
      addPageIfNeeded(blockHeight)

      const lineY = cursorY + (includeImage && signatureImage ? imageHeight + imageGap : 0)
      if (includeImage && signatureImage) {
        const imageX = (pageWidth - imageWidth) / 2
        const imageY = lineY - imageHeight - imageGap
        pdf.addImage(signatureImage.dataUrl, 'PNG', imageX, imageY, imageWidth, imageHeight)
      }

      pdf.line(signatureLineX, lineY, signatureLineX + signatureLineWidth, lineY)

      const labelWidth = pdf.getTextWidth(label)
      pdf.text(label, (pageWidth - labelWidth) / 2, lineY + labelOffset)

      if (name) {
        const nameWidth = pdf.getTextWidth(name)
        pdf.text(name, (pageWidth - nameWidth) / 2, lineY + labelOffset + nameOffset)
        cursorY = lineY + labelOffset + nameOffset + signatureGap
      } else {
        cursorY = lineY + labelOffset + signatureGap
      }
    }

    drawSignatureBlock('Contratante', null, false)
    drawSignatureBlock('Contratada', 'Izalana Pereira Nepomuceno - CRP 11/20792', true)

    pdf.save(fileName)
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
          <h1 className="text-3xl font-bold text-gray-900">Pacientes</h1>
          <p className="text-gray-600 mt-2">Gerencie seus pacientes e suas informações.</p>
        </div>
        <button
          onClick={() => { setReactivateMode(false); setShowAddForm(true) }}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 w-full sm:w-auto"
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
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start sm:items-center gap-4 min-w-0">
                    <div className="bg-emerald-100 rounded-full p-3">
                      <User className="h-6 w-6 text-emerald-600" />
                    </div>
                    <div className="min-w-0">
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
                      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 mt-1">
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
                  
                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:justify-end">
                    <button
                      onClick={() => { setReactivateMode(false); setEditingPatient(patient) }}
                      className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                      title="Editar paciente"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => { void handleGenerateContract(patient) }}
                      className="p-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                      title="Gerar contrato"
                      aria-label="Gerar contrato"
                    >
                      <FileText className="h-4 w-4" />
                    </button>
                    {patient.active ? (
                      <button
                        onClick={() => handleDeactivate(patient)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Inativar paciente"
                      >
                        <UserX className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleActivate(patient)}
                        className="p-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                        title="Reativar paciente"
                      >
                        <UserCheck className="h-4 w-4" />
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
                onClick={() => { setReactivateMode(false); setShowAddForm(true) }}
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
          forceManageAutoSessions={reactivateMode}
          onClose={() => {
            setShowAddForm(false)
            setEditingPatient(null)
            setReactivateMode(false)
          }}
          onSave={() => {
            loadPatients()
            setShowAddForm(false)
            setEditingPatient(null)
            setReactivateMode(false)
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
  onSave,
  forceManageAutoSessions = false
}: { 
  patient: Patient | null
  onClose: () => void
  onSave: () => void
  forceManageAutoSessions?: boolean
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
    active: patient?.active ?? true,
    auto_renew_sessions: patient?.auto_renew_sessions ?? false
  })
  
  const [sessionSchedules, setSessionSchedules] = useState<SessionSchedule[]>(
    (patient?.session_schedules as SessionSchedule[] | undefined) || []
  )
  
  const isNewPatient = !patient
  const [manageAutoSessions, setManageAutoSessions] = useState(
    isNewPatient || forceManageAutoSessions || (patient?.session_schedules?.length ?? 0) > 0
  )
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
        session_schedules: sessionSchedules.length > 0 ? sessionSchedules : patient?.session_schedules || null,
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
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto overflow-x-hidden">
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
              <div className="md:col-span-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">Renovacao automatica</h4>
                    <p className="text-sm text-gray-600">
                      Ao finalizar todas as sessoes, novas sessoes serao criadas com o mesmo padrao.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.auto_renew_sessions}
                      onChange={(e) => setFormData(prev => ({ ...prev, auto_renew_sessions: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
              </div>
            </div>
          </div>
          
          {/* Automatic Session Creation */}
          <div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
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

