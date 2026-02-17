import React, { useState, useEffect } from 'react'
import { patientService } from '../services/patientService'
import { profileService } from '../services/profileService'
import { sessionService } from '../services/sessionService'
import { supabase } from '../lib/supabase'
import { Patient, Profile, Session, SessionSchedule } from '../types'
import { Plus, Search, Edit, UserX, UserCheck, User, Phone, Mail, MapPin, Calendar, Activity, Clock, FileText, Link2, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { addDays, addWeeks, format, parseISO } from 'date-fns'
import { normalizeSearchText } from '../lib/search'
import { ptBR } from 'date-fns/locale'
import { jsPDF } from 'jspdf'
import ConflictModal from '../components/common/ConflictModal'
import { findSessionConflict, getFirstAvailableSessionStart } from '../lib/scheduling'

export default function Patients() {
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null)
  const [reactivateMode, setReactivateMode] = useState(false)
  const [copyingLinkFor, setCopyingLinkFor] = useState<string | null>(null)
  const [approvalMode, setApprovalMode] = useState(false)
  const [rejectingPatient, setRejectingPatient] = useState<Patient | null>(null)
  const [rejectingLoading, setRejectingLoading] = useState(false)

  useEffect(() => {
    loadPatients()
    loadProfile()
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

  const loadProfile = async () => {
    const data = await profileService.getProfile()
    setProfile(data)
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

  const handleRejectPatient = async () => {
    if (!rejectingPatient) return

    try {
      setRejectingLoading(true)
      const { error } = await patientService.deletePatient(rejectingPatient.id)
      if (error) throw error

      setPatients(prev => prev.filter(p => p.id !== rejectingPatient.id))
      toast.success('Paciente recusado e removido')
      setRejectingPatient(null)
    } catch (error) {
      console.error('Erro ao recusar paciente:', error)
      toast.error('Erro ao recusar paciente')
    } finally {
      setRejectingLoading(false)
    }
  }

  const copyTextToClipboard = async (value: string) => {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(value)
      return
    }

    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }

  const handleCopyPushLink = async (patient: Patient) => {
    if (copyingLinkFor) return
    setCopyingLinkFor(patient.id)
    try {
      const { data, error } = await supabase.rpc('get_or_create_push_consent_token', {
        p_patient_id: patient.id
      })

      if (error) {
        throw error
      }

      const token = Array.isArray(data) ? data[0] : data
      if (!token || typeof token !== 'string') {
        throw new Error('Token não retornado.')
      }

      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const link = `${origin}/notificacoes?consent=${token}`

      await copyTextToClipboard(link)

      const sentTo = patient.email || patient.phone || null
      await supabase.rpc('mark_push_consent_token_sent', {
        p_token: token,
        p_sent_to: sentTo,
        p_sent_via: 'copy'
      })

      toast.success('Link de lembretes copiado')
    } catch (error) {
      console.error('Erro ao copiar link de push:', error)
      toast.error('Falha ao copiar link de lembretes')
    } finally {
      setCopyingLinkFor(null)
    }
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
    { value: 2, label: 'Terça-feira' },
    { value: 3, label: 'Quarta-feira' },
    { value: 4, label: 'Quinta-feira' },
    { value: 5, label: 'Sexta-feira' },
    { value: 6, label: 'Sábado' }
  ]

  const frequencyLabels: Record<string, string> = {
    weekly: 'Semanal',
    biweekly: 'Quinzenal',
    monthly: 'Mensal',
    as_needed: 'Conforme necessário'
  }

  const paymentStatusLabels: Record<string, string> = {
    paid: 'Pago',
    pending: 'Pendente',
    cancelled: 'Cancelado'
  }

  const contractClauses = [
    '1. O processo de psicoterapia iniciará a partir da autorização de um(a) dos(as) responsáveis da criança ou adolescente. O processo se dará em médio a longo prazo. Afirma-se o sigilo profissional dos atendimentos, no qual não há violação dos dados, ou seja, informações obtidas nos atendimentos com o(a) paciente para outrem (Com exceção em casos do(a) paciente colocar a própria vida em risco ou de outrem).',
    '2. O processo deve ser iniciado a partir da entrevista com pais e/ou responsáveis da criança ou adolescente, recolhendo as principais informações e os motivos para iniciar o processo. As entrevistas com os pais e/ou responsáveis devem ser realizadas de forma periódica à medida que a profissional sinta necessidade, ou ainda que os próprios responsáveis do(a) paciente solicitem.',
    '2.1. O atendimento com os responsáveis do(a) adolescente acontecerá mediante aos acordos feitos entre paciente e a profissional, caso lhe for pertinente.',
    '3. Os atendimentos terão frequência de, no mínimo, uma vez por semana, em horário e dia preestabelecidos por todas as partes. Podendo passar por alterações e/ou aumento de sessões semanais, caso haja necessidade clínica.',
    '4. O valor das sessões será definido pela profissional, mas poderá passar por alterações no decorrer do processo à medida que as partes sintam a necessidade de modificar.',
    '5. O valor da sessão sofrerá reajuste anual de 10%, acordado em contrato com o(s) responsável(eis), acontecendo no início de cada ano ou a cada ano de acompanhamento.',
    '6. O pagamento das sessões é definido pela profissional, sendo também um combinado entre as partes, podendo sofrer ou não alteração, como informado no item 3 e 4.',
    '7. As faltas, os atrasos e as interrupções do processo devem ser avisadas com antecedência à profissional, para que não prejudique o processo do(a) paciente. É possível que, diante das dificuldades de permanência, seja necessário encaminhar o(a) paciente para outro(a) profissional.',
    '8. A profissional avisará com antecedência em caso de faltas ou atrasos. Assim, disponibilizando-se para a reposição dos atendimentos e das horas, sem ônus da sessão de reposição.',
    '9. Faltas serão cobradas, com ou sem aviso prévio; faltas informadas antes de 24 horas poderão realizar reposição sem custo adicional, caso seja avisado dentro das 24h da sessão, a sessão de reposição será cobrada como sessão extra.',
    '10. A profissional avisará com antecedência quando lhe couber tirar férias ou recesso, tendo, portanto, breve interrupção dos atendimentos/pagamentos. As férias podem ocorrer uma ou duas vezes ao ano, no mês de julho e/ou no mês de dezembro (recesso das festas e dos feriados de final de ano). No entanto, podem ocorrer modificações caso o processo possa sofrer prejuízos com a interrupção ocasionada por férias ou recesso. As sessões que não ocorrerem devido às férias da profissional não serão cobradas.',
    '11. Em caso de férias escolares, as sessões não sofrem mudança, sendo estas permanecendo em seu horário reservado preservado, com os mesmos combinados em contrato.',
    '12. É de suma importância a presença semanal do(a) paciente nas sessões, sendo repensada a continuidade caso haja pelo menos três faltas consecutivas. Logo, as entrevistas periódicas com os pais também são realizadas pelo menos a cada seis a oito sessões com a criança ou o adolescente. Essa periodicidade semanal dos atendimentos com o(a) paciente pode ser repensada, bem como as periodicidades dos atendimentos com a família.',
    '13. Os atendimentos duram em torno de, no mínimo, 45 minutos. Em caso de atrasos do(a) paciente, o tempo não será alterado, sendo utilizado o tempo restante da sessão. Em caso de a profissional atrasar, o tempo do paciente não é prejudicado, sendo reposto na mesma sessão ou em outras, seguintes.',
    '14. Em caso de interrupção do processo, é relevante que sejam realizadas sessões para facilitar o processo de desligamento da criança ou adolescente, como também a realização de pelo menos uma sessão com os pais e/ou responsáveis.',
    '15. Em caso de necessidade de outros acompanhamentos, a profissional poderá realizar encaminhamentos para outros especialistas com o intuito de complementar e ampliar o cuidado do(a) paciente, bem como encaminhamentos direcionados aos membros da família do(a) paciente.',
    '16. A profissional poderá ficar autorizada a realizar visitas escolares e/ou contato com outros profissionais que o(a) acompanham, rede de apoio ou membros que fazem parte do ciclo de relações da criança ou adolescente.',
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

  const loadImageData = async (src: string) => {
    let dataUrl = src
    if (!src.startsWith('data:')) {
      const response = await fetch(src)
      if (!response.ok) {
        throw new Error('Erro ao carregar assinatura')
      }
      const blob = await response.blob()
      dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('Erro ao ler assinatura'))
        reader.readAsDataURL(blob)
      })
    }
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Erro ao carregar assinatura'))
      image.src = dataUrl
    })
    return { dataUrl, width: img.width, height: img.height }
  }

  const getImageFormat = (dataUrl: string) => {
    if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) {
      return 'JPEG'
    }
    return 'PNG'
  }

  const handleGenerateContract = async (patient: Patient) => {
    const slug = normalizeSearchText(patient.full_name)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
    const fileName = `contrato-${slug || 'paciente'}.pdf`
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
    const margin = 36
    const lineHeight = 14
    const sectionGap = 6
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const maxWidth = pageWidth - margin * 2
    let cursorY = margin
    let contractProfile = profile

    if (!contractProfile) {
      contractProfile = await profileService.getProfile()
      setProfile(contractProfile)
    }

    const contractorName = contractProfile?.full_name?.trim() || ''
    const contractorCrp = contractProfile?.crp_number?.trim() || ''
    const contractorLineWithCrp = [
      contractorName ? contractorName : null,
      contractorCrp ? `CRP ${contractorCrp}` : null
    ].filter(Boolean).join(' - ')
    const signatureData = contractProfile?.signature_data?.trim() || ''
    const logoData = contractProfile?.logo_data?.trim() || ''
    let signatureImage: { dataUrl: string; width: number; height: number } | null = null
    let logoImage: { dataUrl: string; width: number; height: number } | null = null

    if (signatureData) {
      try {
        signatureImage = await loadImageData(signatureData)
      } catch (error) {
        signatureImage = null
      }
    }
    if (logoData) {
      try {
        logoImage = await loadImageData(logoData)
      } catch (error) {
        logoImage = null
      }
    }

    const contractorLine = signatureImage ? contractorLineWithCrp : contractorName

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
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

    const addHeader = (text: string) => {
      const logoSize = 48
      const logoGap = 12
      const titleX = logoImage ? margin + logoSize + logoGap : margin
      const titleMaxWidth = pageWidth - margin - titleX

      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(12)

      const lines = pdf.splitTextToSize(text, titleMaxWidth) as string[]
      const blockHeight = Math.max(logoImage ? logoSize : 0, lines.length * lineHeight)
      addPageIfNeeded(blockHeight)

      if (logoImage) {
        const ratio = logoImage.width / logoImage.height
        let logoWidth = logoSize
        let logoHeight = logoSize
        if (ratio >= 1) {
          logoHeight = logoWidth / ratio
        } else {
          logoWidth = logoHeight * ratio
        }
        const logoY = cursorY
        pdf.addImage(
          logoImage.dataUrl,
          getImageFormat(logoImage.dataUrl),
          margin,
          logoY,
          logoWidth,
          logoHeight
        )
      }

      const titleY = cursorY + 14
      lines.forEach((line, index) => {
        pdf.text(line, titleX, titleY + index * lineHeight)
      })

      cursorY += Math.max(logoImage ? logoSize : 0, lines.length * lineHeight) + 12
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(10)
    }

    const addSectionTitle = (text: string, showLine: boolean = true) => {
      addPageIfNeeded(lineHeight * 2)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(11)
      pdf.text(text, margin, cursorY)
      if (showLine) {
        const lineY = cursorY - 12
        pdf.setDrawColor(220)
        pdf.line(margin, lineY, pageWidth - margin, lineY)
      }
      cursorY += lineHeight
      cursorY += sectionGap
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(10)
    }

    addHeader('CONTRATO DE PRESTACAO DE SERVICOS PSICOLOGICOS')

    addSectionTitle('DADOS DO PACIENTE', false)
    const addressLineParts = [
      patient.address,
      (patient.city || patient.state) ? [patient.city, patient.state].filter(Boolean).join(' - ') : null,
      patient.zip_code ? `CEP ${patient.zip_code}` : null
    ].filter(Boolean)

    const patientInfoLines = [
      `Nome: ${patient.full_name}`,
      patient.email ? `Email: ${patient.email}` : null,
      patient.phone ? `Telefone: ${patient.phone}` : null,
      formatBirthDate(patient.birth_date) ? `Data de nascimento: ${formatBirthDate(patient.birth_date)}` : null,
      addressLineParts.length ? `Endereço: ${addressLineParts.join(', ')}` : null
    ].filter(Boolean) as string[]

    patientInfoLines.forEach((line) => addWrappedLines(line))
    cursorY += sectionGap

    addSectionTitle('FREQUENCIA DAS SESSOES')
    addWrappedLines(`Frequência: ${frequencyLabels[patient.session_frequency] || patient.session_frequency}`)
    if (patient.session_price !== null && patient.session_price !== undefined) {
      addWrappedLines(`Valor da sessão: R$ ${Number(patient.session_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
    }
    cursorY += sectionGap

    if (patient.session_schedules && patient.session_schedules.length) {
      addSectionTitle('HORARIOS DAS SESSOES')
      patient.session_schedules.forEach((schedule) => {
        const pieces = [
          getDayLabel(schedule.dayOfWeek),
          `${schedule.time} Hrs`
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
        addWrappedLines(`- ${pieces.join(' às ')}`, 12)
      })
      cursorY += sectionGap
    }

    addSectionTitle('CLAUSULAS')
    contractClauses.forEach((clause) => {
      addWrappedLines(clause)
      cursorY += 3
    })

    cursorY += sectionGap * 2
    addWrappedLines('Quaisquer duvidas, fico a disposicao para esclarecimentos.')
    cursorY += sectionGap * 6
    addWrappedLines('Local e data: _________________,________________________________de________')
    cursorY += lineHeight * 5

    const signatureLineWidth = 240
    const signatureLineX = (pageWidth - signatureLineWidth) / 2
    const labelOffset = 14
    const nameOffset = 14
    const signatureGap = 20
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
        pdf.addImage(
          signatureImage.dataUrl,
          getImageFormat(signatureImage.dataUrl),
          imageX,
          imageY,
          imageWidth,
          imageHeight
        )
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
    drawSignatureBlock('Contratada', contractorLine || null, Boolean(signatureImage))

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
          onClick={() => { setReactivateMode(false); setApprovalMode(false); setShowAddForm(true) }}
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
                        {patient.is_temp ? (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            Pendente
                          </span>
                        ) : (
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            patient.active 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {patient.active ? 'Ativo' : 'Inativo'}
                          </span>
                        )}
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
                    {patient.is_temp ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => { setReactivateMode(false); setApprovalMode(true); setEditingPatient(patient) }}
                          className="px-3 py-2 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors flex items-center gap-2"
                          title="Aprovar paciente"
                        >
                          <UserCheck className="h-4 w-4" />
                          Aprovar paciente
                        </button>
                        <button
                          onClick={() => setRejectingPatient(patient)}
                          className="px-3 py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors flex items-center gap-2"
                          title="Recusar paciente"
                        >
                          <Trash2 className="h-4 w-4" />
                          Recusar paciente
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => void handleCopyPushLink(patient)}
                          className="p-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-60"
                          title="Copiar link de lembretes"
                          aria-label="Copiar link de lembretes"
                          disabled={copyingLinkFor === patient.id}
                        >
                          <Link2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => { setReactivateMode(false); setApprovalMode(false); setEditingPatient(patient) }}
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
                      </>
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
                onClick={() => { setReactivateMode(false); setApprovalMode(false); setShowAddForm(true) }}
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
          approvalMode={approvalMode}
          onClose={() => {
            setShowAddForm(false)
            setEditingPatient(null)
            setReactivateMode(false)
            setApprovalMode(false)
          }}
          onSave={() => {
            loadPatients()
            setShowAddForm(false)
            setEditingPatient(null)
            setReactivateMode(false)
            setApprovalMode(false)
          }}
        />
      )}

      {rejectingPatient && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full shadow-lg">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Recusar paciente</h2>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                Tem certeza que deseja recusar <span className="font-semibold">{rejectingPatient.full_name}</span>?
                Os dados serão completamente excluídos.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setRejectingPatient(null)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleRejectPatient}
                  disabled={rejectingLoading}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60"
                >
                  {rejectingLoading ? 'Excluindo...' : 'Recusar e excluir'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Patient Modal Component
function PatientModal({ 
  patient, 
  onClose, 
  onSave,
  forceManageAutoSessions = false,
  approvalMode = false
}: { 
  patient: Patient | null
  onClose: () => void
  onSave: () => void
  forceManageAutoSessions?: boolean
  approvalMode?: boolean
}) {
  const normalizeHexColorValue = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) {
      return ''
    }
    const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`
    return withHash.toLowerCase()
  }

  const isValidHexColor = (value: string) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(value)

  const isApproval = Boolean(approvalMode && patient?.is_temp)
  const initialCalendarColor = patient?.calendar_color ?? (patient ? '' : '#10b981')
  const initialActive = patient?.is_temp ? true : patient?.active ?? true
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
    session_link: patient?.session_link || '',
    meet_event_id: patient?.meet_event_id || '',
    meet_calendar_id: patient?.meet_calendar_id || '',
    active: initialActive,
    auto_renew_sessions: patient?.auto_renew_sessions ?? false,
    calendar_color: initialCalendarColor
  })
  
  const [sessionSchedules, setSessionSchedules] = useState<SessionSchedule[]>(
    (patient?.session_schedules as SessionSchedule[] | undefined) || []
  )
  
  const isNewPatient = !patient
  const [hasSessionLink, setHasSessionLink] = useState(!!patient?.session_link)
  const [manageAutoSessions, setManageAutoSessions] = useState(
    isNewPatient || forceManageAutoSessions || (patient?.session_schedules?.length ?? 0) > 0
  )
  const [loading, setLoading] = useState(false)
  const [generatingMeetLink, setGeneratingMeetLink] = useState(false)
  const [showMeetInviteModal, setShowMeetInviteModal] = useState(false)
  const [invitingPatient, setInvitingPatient] = useState(false)
  const [conflictInfo, setConflictInfo] = useState<{
    patientName: string
    nextAvailableStart: Date
  } | null>(null)
  const [closeAfterConflict, setCloseAfterConflict] = useState(false)
  const normalizedCalendarColor = normalizeHexColorValue(formData.calendar_color)
  const calendarColorValid = normalizedCalendarColor ? isValidHexColor(normalizedCalendarColor) : true
  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  
  const daysOfWeek = [
    { value: 1, label: 'Segunda-feira' },
    { value: 2, label: 'Terça-feira' },
    { value: 3, label: 'Quarta-feira' },
    { value: 4, label: 'Quinta-feira' },
    { value: 5, label: 'Sexta-feira' },
    { value: 6, label: 'Sábado' },
    { value: 0, label: 'Domingo' }
  ]

  const calendarColorOptions = [
    { label: 'Verde', value: '#10b981' },
    { label: 'Azul', value: '#3b82f6' },
    { label: 'Laranja', value: '#f97316' },
    { label: 'Rosa', value: '#ec4899' },
    { label: 'Roxo', value: '#8b5cf6' },
    { label: 'Amarelo', value: '#f59e0b' },
    { label: 'Turquesa', value: '#14b8a6' },
    { label: 'Vermelho', value: '#ef4444' }
  ]

  const handleGenerateMeetLink = async () => {
    if (generatingMeetLink) return

    const name = (formData.full_name || patient?.full_name || '').trim()
    if (!name) {
      toast.error('Informe o nome do paciente para gerar o link.')
      return
    }

    setGeneratingMeetLink(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      let session = sessionData.session
      const now = Math.floor(Date.now() / 1000)

      if (!session || (session.expires_at && session.expires_at - now < 60)) {
        const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession()
        if (refreshError || !refreshedData.session) {
          toast.error('Sessão expirada. Faça login novamente.')
          return
        }
        session = refreshedData.session
      }

      const accessToken = session.access_token || ''
      const payload = patient?.id
        ? { patientId: patient.id, accessToken }
        : { patientName: name, accessToken }

      const { data, error } = await supabase.functions.invoke('google-meet-link', {
        body: payload,
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
      })

      if (error) {
        const message = (error as { message?: string })?.message || 'Falha ao gerar link do Google Meet.'
        if (message.toLowerCase().includes('google_not_connected')) {
          toast.error('Conecte sua conta Google em Configurações para gerar links fixos.')
        } else {
          toast.error(message)
        }
        return
      }

      if (!data?.link) {
        toast.error('Link do Google Meet não retornado.')
        return
      }

      setHasSessionLink(true)
      setFormData(prev => ({
        ...prev,
        session_link: data.link,
        meet_event_id: data.eventId || prev.meet_event_id || '',
        meet_calendar_id: data.calendarId || prev.meet_calendar_id || ''
      }))
      toast.success('Link do Google Meet gerado.')
      setShowMeetInviteModal(true)
    } catch (err: any) {
      const message = String(err?.message || 'Falha ao gerar link do Google Meet.')
      if (message.toLowerCase().includes('google_not_connected')) {
        toast.error('Conecte sua conta Google em Configurações para gerar links fixos.')
      } else {
        toast.error(message)
      }
    } finally {
      setGeneratingMeetLink(false)
    }
  }

  const handleInvitePatientToCalendar = async () => {
    if (invitingPatient) return
    if (!patient?.id) {
      toast.error('Salve o paciente antes de enviar convite para a agenda dele.')
      return
    }

    const email = (formData.email || '').trim()
    if (!email) {
      toast.error('Paciente sem e-mail cadastrado. Preencha o e-mail antes de enviar convite.')
      return
    }
    if (!isValidEmail(email)) {
      toast.error('E-mail do paciente inválido. Corrija antes de enviar convite.')
      return
    }

    const name = (formData.full_name || patient?.full_name || '').trim()
    if (!name) {
      toast.error('Nome do paciente não informado.')
      return
    }

    setInvitingPatient(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      let session = sessionData.session
      const now = Math.floor(Date.now() / 1000)

      if (!session || (session.expires_at && session.expires_at - now < 60)) {
        const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession()
        if (refreshError || !refreshedData.session) {
          toast.error('Sessão expirada. Faça login novamente.')
          return
        }
        session = refreshedData.session
      }

      const accessToken = session.access_token || ''
      const payload = { patientId: patient.id, patientEmail: email, invitePatient: true, accessToken }

      const { error } = await supabase.functions.invoke('google-meet-link', {
        body: payload,
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
      })

      if (error) {
        const message = String((error as { message?: string })?.message || '')
        const normalized = message.toUpperCase()
        if (normalized.includes('INVITE_EMAIL_REQUIRED')) {
          toast.error('Paciente sem e-mail cadastrado. Preencha o e-mail antes de enviar convite.')
          return
        }
        if (normalized.includes('INVITE_EMAIL_INVALID')) {
          toast.error('E-mail do paciente inválido. Corrija antes de enviar convite.')
          return
        }
        if (normalized.includes('GOOGLE_NOT_CONNECTED')) {
          toast.error('Conecte sua conta Google em Configurações para enviar convites.')
          return
        }
        toast.error((error as { message?: string })?.message || 'Falha ao enviar convite para o paciente.')
        return
      }

      toast.success('Convite enviado para a agenda do paciente.')
      setShowMeetInviteModal(false)
    } catch (err: any) {
      const message = String(err?.message || '')
      if (message.toUpperCase().includes('INVITE_EMAIL_REQUIRED')) {
        toast.error('Paciente sem e-mail cadastrado. Preencha o e-mail antes de enviar convite.')
        return
      }
      if (message.toUpperCase().includes('INVITE_EMAIL_INVALID')) {
        toast.error('E-mail do paciente inválido. Corrija antes de enviar convite.')
        return
      }
      toast.error(message || 'Falha ao enviar convite para o paciente.')
    } finally {
      setInvitingPatient(false)
    }
  }
  
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

  const normalizeSchedulesForCompare = (schedules: SessionSchedule[]) => {
    return schedules.map(schedule => ({
      dayOfWeek: schedule.dayOfWeek,
      time: schedule.time,
      paymentStatus: schedule.paymentStatus,
      sessionType: schedule.sessionType || null,
      durationMinutes: schedule.durationMinutes ?? null,
      sessionPrice: schedule.sessionPrice ?? null
    }))
  }

  const getFrequencyIntervalWeeks = (frequency?: string) => {
    switch (frequency) {
      case 'biweekly':
        return 2
      case 'monthly':
        return 4
      case 'as_needed':
        return 0
      default:
        return 1
    }
  }

  const buildPlannedSessionStarts = (weeksToCreate: number) => {
    const planned: Date[] = []
    if (!sessionSchedules.length) {
      return planned
    }

    const nowLocal = new Date()
    const intervalWeeks = getFrequencyIntervalWeeks(formData.session_frequency)
    const occurrences = intervalWeeks === 0
      ? 1
      : Math.max(1, Math.ceil(weeksToCreate / intervalWeeks))

    sessionSchedules.forEach((schedule) => {
      if (!schedule.time) {
        return
      }
      const [hours, minutes] = schedule.time.split(':').map(Number)
      if (Number.isNaN(hours) || Number.isNaN(minutes)) {
        return
      }
      const baseDate = new Date(nowLocal)
      baseDate.setHours(hours, minutes, 0, 0)

      const currentDay = baseDate.getDay()
      let daysToAdd = schedule.dayOfWeek - currentDay
      if (daysToAdd < 0) {
        daysToAdd += 7
      }
      if (daysToAdd === 0 && baseDate < nowLocal) {
        daysToAdd = 7
      }

      const firstSessionDateLocal = addDays(baseDate, daysToAdd)

      for (let occurrence = 0; occurrence < occurrences; occurrence++) {
        const sessionDateLocal = intervalWeeks === 0
          ? firstSessionDateLocal
          : addWeeks(firstSessionDateLocal, occurrence * intervalWeeks)
        planned.push(new Date(sessionDateLocal))
      }
    })

    return planned
  }

  const checkScheduleConflicts = async (patientId?: string) => {
    const { data, error } = await supabase
      .from('sessions')
      .select(`
        *,
        patients (
          id,
          full_name
        )
      `)
      .order('session_date', { ascending: false })

    if (error) {
      throw error
    }

    const sessions = (data || []) as Session[]
    const sessionsToCheck = patientId
      ? sessions.filter((session) => session.patient_id !== patientId)
      : sessions

    const plannedStarts = buildPlannedSessionStarts(12)

    for (const start of plannedStarts) {
      const conflict = findSessionConflict(sessionsToCheck, start)
      if (conflict) {
        const conflictName = conflict.patients?.full_name || 'paciente'
        const nextAvailableStart = getFirstAvailableSessionStart(sessionsToCheck, start)
        setConflictInfo({
          patientName: conflictName,
          nextAvailableStart
        })
        return true
      }
    }

    return false
  }

  const handleScheduleConflict = (error: unknown, options?: { closeAfter?: boolean }) => {
    const rawConflict = (error as { conflict?: unknown } | null)?.conflict
    if (!rawConflict || typeof rawConflict !== 'object') {
      return false
    }
    const conflict = rawConflict as {
      patientName?: string
      nextAvailableStart?: Date | string
    }
    if (!conflict.patientName || !conflict.nextAvailableStart) {
      return false
    }
    const nextAvailableStart = conflict.nextAvailableStart instanceof Date
      ? conflict.nextAvailableStart
      : new Date(conflict.nextAvailableStart)
    if (Number.isNaN(nextAvailableStart.getTime())) {
      return false
    }
    setCloseAfterConflict(Boolean(options?.closeAfter))
    setConflictInfo({
      patientName: conflict.patientName,
      nextAvailableStart
    })
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.full_name.trim()) {
      toast.error('Nome é obrigatório')
      return
    }
    if (!calendarColorValid) {
      toast.error('Cor invalida. Use #RGB ou #RRGGBB.')
      return
    }
    
    setLoading(true)

    try {
      const patientData = {
        ...formData,
        session_schedules: sessionSchedules.length > 0 ? sessionSchedules : patient?.session_schedules || null,
        session_price: formData.session_price ? Number(formData.session_price) : undefined,
        session_link: hasSessionLink ? (formData.session_link?.trim() || null) : null,
        meet_event_id: hasSessionLink ? (formData.meet_event_id?.trim() || null) : null,
        meet_calendar_id: hasSessionLink ? (formData.meet_calendar_id?.trim() || null) : null,
        calendar_color: normalizedCalendarColor || null,
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

      if (isApproval) {
        patientData.is_temp = false
        patientData.active = true
      }

      const schedulesChanged = patient
        ? JSON.stringify(normalizeSchedulesForCompare(sessionSchedules)) !==
          JSON.stringify(normalizeSchedulesForCompare((patient.session_schedules as SessionSchedule[] | undefined) || []))
        : true
      const frequencyChanged = patient ? patient.session_frequency !== formData.session_frequency : false
      const deactivatingPatient = Boolean(patient?.active && patientData.active === false)
      const shouldCheckSchedules = sessionSchedules.length > 0 && !deactivatingPatient && (schedulesChanged || frequencyChanged)

      if (patient) {
        if (shouldCheckSchedules) {
          try {
            const hasConflict = await checkScheduleConflicts(patient.id)
            if (hasConflict) {
              return
            }
          } catch (conflictError) {
            if (handleScheduleConflict(conflictError)) {
              return
            }
            toast.error('Erro ao validar conflitos de agenda')
            return
          }
        }

        const { error } = await patientService.updatePatient(patient.id, patientData)
        if (error) throw error
        if (isApproval) {
          toast.success('Paciente aprovado com sucesso')
        } else if (deactivatingPatient) {
          const { error: deactivateError } = await patientService.deactivatePatient(patient.id)
          if (deactivateError) {
            toast.error('Paciente atualizado, mas erro ao apagar sessões futuras')
          } else {
            toast.success('Paciente inativado e sessões futuras removidas')
          }
        } else if (manageAutoSessions && sessionSchedules.length > 0 && (schedulesChanged || frequencyChanged)) {
          try {
            await sessionService.replaceFutureSessions(
              patient.id,
              sessionSchedules,
              12
            )
            toast.success('Paciente e sessões atualizados com sucesso')
          } catch (sessionError) {
            if (handleScheduleConflict(sessionError)) {
              return
            }
            toast.error('Paciente atualizado, mas erro ao atualizar sessões')
            return
          }
        } else {
          toast.success('Paciente atualizado com sucesso')
        }
      } else {
        if (sessionSchedules.length > 0 && patientData.active !== false) {
          try {
            const hasConflict = await checkScheduleConflicts()
            if (hasConflict) {
              return
            }
          } catch (conflictError) {
            if (handleScheduleConflict(conflictError)) {
              return
            }
            toast.error('Erro ao validar conflitos de agenda')
            return
          }
        }

        const { data: newPatient, error } = await patientService.createPatient(patientData as any)
        if (error) throw error
        
        // Se deve criar sessões automaticamente
        if (manageAutoSessions && sessionSchedules.length > 0 && patientData.active !== false) {
          try {
            await sessionService.createMultipleSessions(
              newPatient?.id || '',
              sessionSchedules,
              12 // Criar sessões para 12 semanas
            )
            toast.success('Paciente e sessões criados com sucesso')
          } catch (sessionError) {
            if (handleScheduleConflict(sessionError, { closeAfter: true })) {
              return
            }
            toast.error('Paciente criado, mas erro ao criar sessões')
            return
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
            {isApproval ? 'Aprovar Paciente' : (patient ? 'Editar Paciente' : 'Novo Paciente')}
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
              
              {!isApproval && (
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
              )}

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cor na agenda
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {calendarColorOptions.map(option => {
                    const isSelected = normalizedCalendarColor === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, calendar_color: option.value }))}
                        className={`h-8 w-8 rounded-full border ${isSelected ? 'ring-2 ring-emerald-500 ring-offset-1' : 'border-gray-300'}`}
                        style={{ backgroundColor: option.value }}
                        title={option.label}
                        aria-label={`Cor ${option.label}`}
                      />
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, calendar_color: '' }))}
                    className="px-3 py-1 text-xs border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50"
                  >
                    Sem cor
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Hex
                    </label>
                    <input
                      type="text"
                      value={formData.calendar_color}
                      onChange={(e) => setFormData(prev => ({ ...prev, calendar_color: e.target.value }))}
                      placeholder="#10b981"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Use #RGB ou #RRGGBB</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Preview
                    </label>
                    <div
                      className="h-10 rounded-lg border border-gray-200"
                      style={{ backgroundColor: calendarColorValid ? (normalizedCalendarColor || '#f3f4f6') : '#f3f4f6' }}
                    />
                  </div>
                </div>
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
            <h3 className="text-lg font-medium text-gray-900 mb-4">Frequência de Sessão</h3>
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
                    <h4 className="text-sm font-medium text-gray-900">Possui link?</h4>
                    <p className="text-sm text-gray-600">
                      Informe um link de atendimento para aparecer na agenda.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasSessionLink}
                      onChange={(e) => {
                        const checked = e.target.checked
                        setHasSessionLink(checked)
                        if (!checked) {
                          setFormData(prev => ({
                            ...prev,
                            session_link: '',
                            meet_event_id: '',
                            meet_calendar_id: ''
                          }))
                        }
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
                {hasSessionLink && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between gap-3">
                      <label className="block text-sm font-medium text-gray-700">
                        Link do atendimento
                      </label>
                      <button
                        type="button"
                        onClick={handleGenerateMeetLink}
                        disabled={generatingMeetLink}
                        className="text-xs font-medium text-emerald-700 border border-emerald-200 px-2 py-1 rounded-md hover:bg-emerald-50 transition-colors disabled:opacity-60"
                      >
                        {generatingMeetLink ? 'Gerando...' : 'Gerar Link'}
                      </button>
                    </div>
                    <input
                      type="url"
                      value={formData.session_link}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        session_link: e.target.value,
                        meet_event_id: '',
                        meet_calendar_id: ''
                      }))}
                      className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder="https://"
                    />
                  </div>
                )}
              </div>
              <div className="md:col-span-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">Renovação automática</h4>
                    <p className="text-sm text-gray-600">
                      Ao finalizar todas as sessões, novas sessões serao criadas com o mesmo padrao.
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
      <ConflictModal
        open={Boolean(conflictInfo)}
        patientName={conflictInfo?.patientName || 'paciente'}
        firstAvailableTime={
          conflictInfo ? format(conflictInfo.nextAvailableStart, 'HH:mm') : ''
        }
        onClose={() => {
          setConflictInfo(null)
          if (closeAfterConflict) {
            setCloseAfterConflict(false)
            onSave()
            return
          }
          setCloseAfterConflict(false)
        }}
      />
      {showMeetInviteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full shadow-lg">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Enviar convite do Google Agenda?</h2>
              <p className="text-sm text-gray-600 mt-1">
                Deseja adicionar o paciente como convidado no evento para aparecer na agenda dele?
              </p>
            </div>
            <div className="p-6 space-y-2">
              <p className="text-sm text-gray-700">
                E-mail atual do paciente: <span className="font-medium">{formData.email || 'não cadastrado'}</span>
              </p>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setShowMeetInviteModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Agora não
              </button>
              <button
                type="button"
                onClick={handleInvitePatientToCalendar}
                disabled={invitingPatient}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-60"
              >
                {invitingPatient ? 'Enviando...' : 'Enviar convite'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

