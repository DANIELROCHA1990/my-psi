import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { jsPDF } from 'jspdf'
import { FileText, Download, Plus, AlertCircle, CheckCircle, Trash2 } from '../lib/icons'
import { medicalRecordService } from '../services/medicalRecordService'
import { patientService } from '../services/patientService'
import { PSIFORM_TOPICS, PsiformTopic, getPsiformInitialValues } from '../lib/medicalRecordPsiformTemplate'
import {
  MedicalRecordAuditEvent,
  MedicalRecordChangeEvent,
  MedicalRecordEntry,
  MedicalRecordSummary,
  PatientClinicalStatusRow
} from '../types/medicalRecord'
import { Patient } from '../types'

const formatDateTime = (value?: string | null) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('pt-BR')
}

const formatSessionDate = (value?: string) => {
  if (!value) return 'sem data'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('pt-BR')
}

const toFileSafe = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()

type CardExportTarget = 'audit' | 'history'

export default function MedicalRecords() {
  const showAdvancedActions = import.meta.env.VITE_ENABLE_CLINICAL_ADMIN_ACTIONS === 'true'
  const [rows, setRows] = useState<PatientClinicalStatusRow[]>([])
  const [loadingRows, setLoadingRows] = useState(true)
  const [selectedPatientId, setSelectedPatientId] = useState<string>('')
  const [record, setRecord] = useState<MedicalRecordSummary | null>(null)
  const [entries, setEntries] = useState<MedicalRecordEntry[]>([])
  const [auditTrail, setAuditTrail] = useState<MedicalRecordAuditEvent[]>([])
  const [changeHistory, setChangeHistory] = useState<MedicalRecordChangeEvent[]>([])
  const [loadingRecord, setLoadingRecord] = useState(false)
  const [recordError, setRecordError] = useState('')
  const [creatingRecord, setCreatingRecord] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selectedPatientData, setSelectedPatientData] = useState<Patient | null>(null)
  const [selectedTopicId, setSelectedTopicId] = useState('')
  const [topicValues, setTopicValues] = useState<Record<string, string>>({})
  const [savingTopic, setSavingTopic] = useState(false)
  const [sessionRows, setSessionRows] = useState<Array<{ session_number: string; session_date: string; content: string }>>([])
  const [expandedSessionRows, setExpandedSessionRows] = useState<number[]>([])
  const [cardExportTarget, setCardExportTarget] = useState<CardExportTarget | null>(null)
  const [exportingCard, setExportingCard] = useState(false)

  const selectedRow = useMemo(
    () => rows.find((row) => row.patient_id === selectedPatientId) || null,
    [rows, selectedPatientId]
  )

  const selectedTopic = useMemo(
    () => PSIFORM_TOPICS.find((topic) => topic.id === selectedTopicId) || null,
    [selectedTopicId]
  )

  const psiformSections = useMemo(() => {
    const order: string[] = []
    const sectionTitleById: Record<string, string> = {}
    for (const topic of PSIFORM_TOPICS) {
      if (!order.includes(topic.sectionId)) {
        order.push(topic.sectionId)
      }
      sectionTitleById[topic.sectionId] = topic.sectionTitle
    }

    return order.map((sectionId) => ({
      sectionId,
      sectionTitle: sectionTitleById[sectionId] || sectionId,
      topics: PSIFORM_TOPICS.filter((topic) => topic.sectionId === sectionId)
    }))
  }, [])

  const topicEntryById = useMemo(() => {
    const map: Record<string, MedicalRecordEntry> = {}
    for (const entry of entries) {
      const payload = entry.payload as Record<string, unknown>
      const topicId = typeof payload?.template_topic_id === 'string' ? payload.template_topic_id : ''
      if (topicId && !map[topicId]) {
        map[topicId] = entry
      }
    }
    return map
  }, [entries])

  const attachmentEntries = useMemo(
    () => entries.filter((entry) => entry.entry_type === 'attachment'),
    [entries]
  )

  const loadRows = async () => {
    try {
      setLoadingRows(true)
      const data = await medicalRecordService.listDerivedStatus()
      setRows(data)
      if (!selectedPatientId && data[0]?.patient_id) {
        setSelectedPatientId(data[0].patient_id)
      }
    } catch (error) {
      const message = String((error as Error)?.message || '')
      if (message.toLowerCase().includes('sessão expirada') || message.toLowerCase().includes('unauthorized')) {
        toast.error('Sessão expirada. Faça login novamente.')
      } else {
        toast.error('Erro ao carregar status de prontuário')
      }
    } finally {
      setLoadingRows(false)
    }
  }

  const loadRecord = async (patientId: string) => {
    if (!patientId) return
    try {
      setLoadingRecord(true)
      setRecordError('')
      const data = await medicalRecordService.getRecord({
        patientId,
        purpose: 'medical_records_page_open',
        limit: 200
      })
      setRecord(data.record)
      setEntries(data.entries || [])
      setAuditTrail(data.auditTrail || [])
      setChangeHistory(data.changeHistory || [])
    } catch (error) {
      const message = String((error as Error)?.message || '')
      setRecordError(message || 'Falha ao carregar prontuário')
      toast.error('Erro ao carregar prontuário')
      setRecord(null)
      setEntries([])
      setAuditTrail([])
      setChangeHistory([])
    } finally {
      setLoadingRecord(false)
    }
  }

  useEffect(() => {
    loadRows()
  }, [])

  useEffect(() => {
    if (!selectedPatientId || loadingRows) return
    if (selectedRow && !selectedRow.has_record) {
      setRecord(null)
      setEntries([])
      setAuditTrail([])
      setChangeHistory([])
      setRecordError('')
      return
    }
    loadRecord(selectedPatientId)
  }, [selectedPatientId, selectedRow?.has_record, loadingRows])

  useEffect(() => {
    let active = true
    if (!selectedPatientId) {
      setSelectedPatientData(null)
      return
    }

    patientService
      .getPatient(selectedPatientId)
      .then((patient) => {
        if (active) {
          setSelectedPatientData(patient)
        }
      })
      .catch(() => {
        if (active) {
          setSelectedPatientData(null)
        }
      })

    return () => {
      active = false
    }
  }, [selectedPatientId])

  const closeTopicModal = () => {
    setSelectedTopicId('')
    setTopicValues({})
    setSessionRows([])
    setExpandedSessionRows([])
  }

  const openTopicModal = (topic: PsiformTopic) => {
    let nextValues = getPsiformInitialValues(topic, selectedPatientData)
    const existing = topicEntryById[topic.id]
    const payload = existing?.payload as Record<string, unknown> | undefined
    const existingFields =
      payload && typeof payload.fields === 'object' && payload.fields !== null
        ? (payload.fields as Record<string, unknown>)
        : null

    if (existingFields) {
      for (const [key, value] of Object.entries(existingFields)) {
        if (value !== undefined && value !== null) {
          nextValues[key] = String(value)
        }
      }
    } else if (typeof payload?.text === 'string' && topic.fields.length === 1) {
      nextValues[topic.fields[0].id] = payload.text
    }

    if (topic.id === 'evolution-session-atmosphere') {
      const rowsFromPayload =
        existingFields && Array.isArray(existingFields.session_rows)
          ? existingFields.session_rows
              .map((row) => (typeof row === 'object' && row ? row : null))
              .filter(Boolean)
              .map((row: any) => ({
                session_number: String(row.session_number || ''),
                session_date: String(row.session_date || ''),
                content: String(row.content || '')
              }))
          : []

      if (rowsFromPayload.length) {
        setSessionRows(rowsFromPayload)
        setExpandedSessionRows([])
      } else {
        setSessionRows([
          {
            session_number: nextValues.session_number || '',
            session_date: nextValues.session_date || '',
            content: nextValues.content || ''
          }
        ])
        setExpandedSessionRows([0])
      }
    } else {
      setSessionRows([])
      setExpandedSessionRows([])
    }

    setSelectedTopicId(topic.id)
    setTopicValues(nextValues)
  }

  const handleTopicValueChange = (fieldId: string, value: string) => {
    setTopicValues((prev) => ({
      ...prev,
      [fieldId]: value
    }))
  }

  const addSessionRow = () => {
    setSessionRows((prev) => {
      const nextIndex = prev.length
      setExpandedSessionRows((expanded) => (expanded.includes(nextIndex) ? expanded : [...expanded, nextIndex]))
      return [...prev, { session_number: '', session_date: '', content: '' }]
    })
  }

  const removeSessionRow = (index: number) => {
    setSessionRows((prev) => prev.filter((_, idx) => idx !== index))
    setExpandedSessionRows((prev) =>
      prev
        .filter((idx) => idx !== index)
        .map((idx) => (idx > index ? idx - 1 : idx))
    )
  }

  const updateSessionRow = (index: number, field: 'session_number' | 'session_date' | 'content', value: string) => {
    setSessionRows((prev) =>
      prev.map((row, idx) => (idx === index ? { ...row, [field]: value } : row))
    )
  }

  const toggleSessionRow = (index: number) => {
    setExpandedSessionRows((prev) => (prev.includes(index) ? prev.filter((idx) => idx !== index) : [...prev, index]))
  }

  const handleSaveTopic = async () => {
    if (!selectedPatientId || !selectedTopic) return

    const hasContent =
      selectedTopic.id === 'evolution-session-atmosphere'
        ? sessionRows.some(
            (row) =>
              row.session_number.trim().length > 0 ||
              row.session_date.trim().length > 0 ||
              row.content.trim().length > 0
          )
        : Object.values(topicValues).some((value) => value.trim().length > 0)

    if (!hasContent) {
      toast.error('Preencha ao menos um campo do tópico')
      return
    }

    const mergedFields =
      selectedTopic.id === 'evolution-session-atmosphere'
        ? {
            ...topicValues,
            session_rows: sessionRows,
            sessions_count: sessionRows.length
          }
        : topicValues

    const payload = {
      template_topic_id: selectedTopic.id,
      template_topic_title: selectedTopic.title,
      template_section_id: selectedTopic.sectionId,
      template_section_title: selectedTopic.sectionTitle,
      legend: selectedTopic.legend,
      fields: mergedFields,
      imported_patient_snapshot: {
        full_name: selectedPatientData?.full_name || '',
        birth_date: selectedPatientData?.birth_date || '',
        phone: selectedPatientData?.phone || '',
        email: selectedPatientData?.email || ''
      }
    }

    const existingEntry = topicEntryById[selectedTopic.id]

    setSavingTopic(true)
    try {
      if (existingEntry?.id) {
        await medicalRecordService.updateEntry({
          entryId: existingEntry.id,
          payload,
          titleRedacted: `Prontuário · ${selectedTopic.title}`,
          purpose: 'clinical_update'
        })
      } else {
        await medicalRecordService.createEntry({
          patientId: selectedPatientId,
          entryType: selectedTopic.entryType,
          payload,
          titleRedacted: `Prontuário · ${selectedTopic.title}`,
          purpose: 'clinical_write'
        })
      }

      toast.success('Tópico do prontuário salvo')
      await loadRecord(selectedPatientId)
      await loadRows()
      closeTopicModal()
    } catch (error: any) {
      toast.error(error?.message || 'Falha ao salvar tópico do prontuário')
    } finally {
      setSavingTopic(false)
    }
  }

  const handleCreateRecord = async () => {
    if (!selectedPatientId) return
    setCreatingRecord(true)
    try {
      await medicalRecordService.createOrGetRecord(selectedPatientId, 'medical_records_page_create')
      await loadRows()
      await loadRecord(selectedPatientId)
      toast.success('Prontuário criado com sucesso')
    } catch (error: any) {
      toast.error(error?.message || 'Falha ao criar prontuário')
    } finally {
      setCreatingRecord(false)
    }
  }

  const handleAttachmentDownload = async (entry: MedicalRecordEntry) => {
    const attachmentId = typeof entry.payload?.attachmentId === 'string' ? entry.payload.attachmentId : ''
    if (!attachmentId) {
      toast.error('Anexo indisponível')
      return
    }

    try {
      const data = await medicalRecordService.getAttachmentUrl(attachmentId)
      if (data.signedUrl) {
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
      } else {
        toast.error('URL assinada indisponível')
      }
    } catch (error) {
      toast.error('Falha ao abrir anexo')
    }
  }

  const handleExportJson = async () => {
    if (!selectedPatientId) return
    try {
      const data = await medicalRecordService.exportRecord(selectedPatientId)
      if (data.signedUrl) {
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
      }
      toast.success('Exportação gerada (auditada)')
    } catch (error) {
      toast.error('Falha ao exportar prontuário')
    }
  }

  const handleGeneratePdf = async () => {
    if (!selectedPatientId) return
    try {
      const data = await medicalRecordService.generatePdf(selectedPatientId, `Prontuário ${selectedRow?.patient?.full_name || ''}`)
      if (data.signedUrl) {
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
      }
      toast.success('PDF clínico gerado (auditado)')
    } catch (error) {
      toast.error('Falha ao gerar PDF clínico')
    }
  }

  const handleAttachmentUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !selectedPatientId) return

    setUploading(true)
    try {
      const upload = await medicalRecordService.createAttachmentUploadUrl({
        patientId: selectedPatientId,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size
      })

      const putResponse = await fetch(upload.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file
      })

      if (!putResponse.ok) {
        throw new Error('Falha no upload do anexo')
      }

      toast.success('Anexo enviado com sucesso')
      await loadRecord(selectedPatientId)
      await loadRows()
    } catch (error: any) {
      toast.error(error?.message || 'Falha ao enviar anexo')
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  const handleRunLegacyMigration = async () => {
    try {
      const dryRun = await medicalRecordService.migrateLegacy(true, false)
      toast.success(`Dry-run: ${dryRun.migratedPatients} pacientes, ${dryRun.migratedSessionEntries} sessões`) 
    } catch (error) {
      toast.error('Falha no dry-run de migração')
    }
  }

  const buildCardExportRows = (target: CardExportTarget) => {
    if (target === 'audit') {
      return auditTrail.map((item) => ({
        id: item.id,
        acao: item.action,
        recurso: item.resource_type,
        recurso_id: item.resource_id || '',
        resultado: item.result,
        codigo_resultado: item.result_code || '',
        origem: item.origin || '',
        proposito: item.purpose || '',
        criado_em: item.created_at
      }))
    }

    return changeHistory.map((item) => ({
      id: item.id,
      acao: item.action,
      recurso: item.resource_type,
      recurso_id: item.resource_id,
      checksum_antes: item.before_checksum || '',
      checksum_depois: item.after_checksum || '',
      resumo: item.change_summary_redacted || '',
      criado_em: item.created_at
    }))
  }

  const triggerBlobDownload = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  const exportCardAsJson = (target: CardExportTarget) => {
    const rowsToExport = buildCardExportRows(target)
    const payload = {
      target,
      patientId: selectedPatientId,
      patientName: selectedRow?.patient?.full_name || '',
      exportedAt: new Date().toISOString(),
      rows: rowsToExport
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
    const patientSlug = toFileSafe(selectedRow?.patient?.full_name || 'paciente')
    const suffix = target === 'audit' ? 'auditoria' : 'historico-versoes'
    triggerBlobDownload(blob, `${suffix}-${patientSlug}.json`)
  }

  const exportCardAsPdf = (target: CardExportTarget) => {
    const rowsToExport = buildCardExportRows(target)
    const patientName = selectedRow?.patient?.full_name || 'Paciente'
    const title = target === 'audit' ? 'Relatório de Auditoria' : 'Relatório de Histórico de Versões'
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 36
    const lineHeight = 14
    const contentWidth = pageWidth - margin * 2
    let y = margin

    const ensureSpace = (needed = lineHeight) => {
      if (y + needed > pageHeight - margin) {
        doc.addPage()
        y = margin
      }
    }

    const writeLine = (text: string, options?: { bold?: boolean; indent?: number; size?: number; gap?: number }) => {
      const indent = options?.indent || 0
      const size = options?.size || 10
      const gap = options?.gap ?? 3
      const lines = doc.splitTextToSize(text || ' ', contentWidth - indent) as string[]
      doc.setFont('helvetica', options?.bold ? 'bold' : 'normal')
      doc.setFontSize(size)
      for (const line of lines) {
        ensureSpace(size + gap)
        doc.text(line, margin + indent, y)
        y += size + gap
      }
    }

    writeLine(title, { bold: true, size: 14, gap: 4 })
    writeLine(`Paciente: ${patientName}`)
    writeLine(`Gerado em: ${new Date().toLocaleString('pt-BR')}`)
    y += 6

    if (!rowsToExport.length) {
      writeLine('Nenhum registro disponível para exportação.')
    } else {
      rowsToExport.forEach((row, index) => {
        writeLine(`Registro ${index + 1}`, { bold: true, gap: 2 })
        Object.entries(row).forEach(([key, value]) => {
          writeLine(`${key}: ${String(value || '')}`, { indent: 10 })
        })
        y += 6
      })
    }

    const blob = doc.output('blob')
    const patientSlug = toFileSafe(selectedRow?.patient?.full_name || 'paciente')
    const suffix = target === 'audit' ? 'auditoria' : 'historico-versoes'
    triggerBlobDownload(blob, `${suffix}-${patientSlug}.pdf`)
  }

  const handleCardExport = async (format: 'pdf' | 'json') => {
    if (!cardExportTarget) return
    setExportingCard(true)
    try {
      if (format === 'json') {
        exportCardAsJson(cardExportTarget)
      } else {
        exportCardAsPdf(cardExportTarget)
      }
      await medicalRecordService.auditAccess({
        patientId: selectedPatientId,
        medicalRecordId: record?.id || undefined,
        resourceType: cardExportTarget === 'audit' ? 'medical_record_access_audit' : 'medical_record_change_history',
        action: format === 'pdf' ? 'export_pdf' : 'export_json',
        purpose: `medical_records_${cardExportTarget}_export`
      })
      toast.success(`Exportação de ${cardExportTarget === 'audit' ? 'auditoria' : 'histórico'} gerada`)
      setCardExportTarget(null)
    } catch (error) {
      toast.error('Falha ao exportar dados do card')
    } finally {
      setExportingCard(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-100">Prontuário</h1>
          <p className="text-gray-600 dark:text-slate-300 mt-2">
            Dados clínicos sensíveis com acesso protegido, auditoria e integração operacional segura.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {showAdvancedActions ? (
            <button
              type="button"
              onClick={handleRunLegacyMigration}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800"
            >
              Dry-run migração legada
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleGeneratePdf}
            disabled={!selectedPatientId}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            Gerar PDF
          </button>
          {showAdvancedActions ? (
            <button
              type="button"
              onClick={handleExportJson}
              disabled={!selectedPatientId}
              className="px-4 py-2 rounded-lg border border-emerald-600 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 disabled:opacity-60"
            >
              Exportar JSON
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-4 xl:col-span-1">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Pacientes</h2>
          {loadingRows ? (
            <div className="py-10 text-center text-sm text-gray-500 dark:text-slate-400">Carregando...</div>
          ) : (
            <div className="mt-3 space-y-2 max-h-[70vh] overflow-auto pr-1">
              {rows.map((row) => {
                const selected = row.patient_id === selectedPatientId
                return (
                  <button
                    key={row.patient_id}
                    type="button"
                    onClick={() => setSelectedPatientId(row.patient_id)}
                    className={`w-full text-left rounded-lg border p-3 transition-colors ${
                      selected
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                        : 'border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-slate-100">
                          {row.patient?.full_name || 'Paciente'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                          Última atualização: {formatDateTime(row.updated_at)}
                        </p>
                      </div>
                      {row.alert_level > 0 ? (
                        <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                          Alerta {row.alert_level}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span className={`px-2 py-1 rounded-full ${row.has_record ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'}`}>
                        {row.has_record ? 'Prontuário ativo' : 'Sem prontuário'}
                      </span>
                      {row.has_pending_evolution ? (
                        <span className="px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">Evolução pendente</span>
                      ) : null}
                      {row.has_pending_document ? (
                        <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700">Documento pendente</span>
                      ) : null}
                    </div>
                  </button>
                )
              })}
              {!rows.length && <p className="text-sm text-gray-500 dark:text-slate-400">Nenhum paciente encontrado.</p>}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-4 xl:col-span-2">
          {!selectedPatientId ? (
            <div className="py-16 text-center text-gray-500 dark:text-slate-400">Selecione um paciente para abrir o prontuário.</div>
          ) : loadingRecord ? (
            <div className="py-16 text-center text-gray-500 dark:text-slate-400">Carregando prontuário...</div>
          ) : record ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-4 bg-gray-50 dark:bg-slate-800/60">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
                      {selectedRow?.patient?.full_name || 'Paciente'}
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-slate-300 mt-1">
                      Prontuário #{record.id.slice(0, 8)} · Aberto em {formatDateTime(record.opened_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                      {record.record_status}
                    </span>
                    {record.has_pending_evolution ? (
                      <span className="px-2 py-1 rounded-full bg-yellow-100 text-yellow-700 text-xs font-medium">evolução pendente</span>
                    ) : null}
                    {record.has_pending_document ? (
                      <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">documento pendente</span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                    Prontuário
                  </h3>
                  <span className="text-xs text-gray-500 dark:text-slate-400">
                    {Object.keys(topicEntryById).length}/{PSIFORM_TOPICS.length} preenchidos
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                  Dados de identificação são importados do módulo Pacientes e podem ser complementados no modal.
                </p>

                <div className="mt-4 space-y-4">
                  {psiformSections.map((section) => (
                    <div key={section.sectionId} className="space-y-2">
                      <h4 className="text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wide">
                        {section.sectionTitle}
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {section.topics.map((topic) => {
                          const isFilled = Boolean(topicEntryById[topic.id])
                          return (
                            <button
                              key={topic.id}
                              type="button"
                              onClick={() => openTopicModal(topic)}
                              className={`text-left rounded-lg border p-3 transition-colors ${
                                isFilled
                                  ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100'
                                  : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{topic.title}</p>
                                {isFilled ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                    <CheckCircle className="h-3.5 w-3.5" />
                                    Preenchido
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-200">
                                    Pendente
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-600 dark:text-slate-300 mt-1">{topic.legend}</p>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Anexos</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                    Bucket privado com URL assinada curta e trilha auditável.
                  </p>
                  <div className="mt-3">
                    <label className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer inline-block">
                      {uploading ? 'Enviando...' : 'Enviar anexo'}
                      <input type="file" className="hidden" onChange={handleAttachmentUpload} disabled={uploading} />
                    </label>
                  </div>
                  <div className="mt-3 space-y-2 max-h-44 overflow-auto pr-1">
                    {attachmentEntries.slice(0, 5).map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => handleAttachmentDownload(entry)}
                        className="w-full text-left px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 text-xs text-gray-700 dark:text-slate-200"
                      >
                        {entry.title_redacted || 'Anexo clínico'} · {formatDateTime(entry.event_at)}
                      </button>
                    ))}
                    {!attachmentEntries.length ? (
                      <p className="text-xs text-gray-500 dark:text-slate-400">Nenhum anexo enviado.</p>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Auditoria</h3>
                    <button
                      type="button"
                      onClick={() => setCardExportTarget('audit')}
                      className="inline-flex items-center justify-center p-2 rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800"
                      title="Exportar auditoria"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                    Leitura, edição, exportação e download ficam registrados.
                  </p>
                  <div className="mt-3 space-y-2 max-h-44 overflow-auto pr-1">
                    {auditTrail.slice(0, 5).map((audit) => (
                      <div key={audit.id} className="rounded-lg border border-gray-200 dark:border-slate-700 p-2">
                        <p className="text-xs text-gray-700 dark:text-slate-200 font-medium">{audit.action}</p>
                        <p className="text-[11px] text-gray-500 dark:text-slate-400">{formatDateTime(audit.created_at)}</p>
                      </div>
                    ))}
                    {!auditTrail.length ? (
                      <p className="text-xs text-gray-500 dark:text-slate-400">Nenhum evento de auditoria.</p>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Histórico de versões</h3>
                    <button
                      type="button"
                      onClick={() => setCardExportTarget('history')}
                      className="inline-flex items-center justify-center p-2 rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800"
                      title="Exportar histórico de versões"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                    Alterações são versionadas com checksum e histórico de mudanças.
                  </p>
                  <div className="mt-3 space-y-2 max-h-44 overflow-auto pr-1">
                    {changeHistory.slice(0, 5).map((history) => (
                      <div key={history.id} className="rounded-lg border border-gray-200 dark:border-slate-700 p-2">
                        <p className="text-xs text-gray-700 dark:text-slate-200 font-medium">{history.action}</p>
                        <p className="text-[11px] text-gray-500 dark:text-slate-400">{formatDateTime(history.created_at)}</p>
                      </div>
                    ))}
                    {!changeHistory.length ? (
                      <p className="text-xs text-gray-500 dark:text-slate-400">Nenhuma versão registrada.</p>
                    ) : null}
                  </div>
                </div>
              </div>

              <p className="text-xs text-gray-500 dark:text-slate-400 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5" />
                Resumo, Anamnese, Evoluções, Exame Objetivo, Prescrições, Exames, Encaminhamentos, Problemas Ativos, Intervenções Atuais, Anexos, Auditoria e Histórico são tratados via cards do prontuário.
              </p>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-200">
                {showAdvancedActions ? (
                  <button
                    type="button"
                    onClick={handleExportJson}
                    className="px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" /> Exportar JSON
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleGeneratePdf}
                  className="px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-2"
                >
                  <FileText className="h-4 w-4" /> Gerar PDF
                </button>
              </div>
            </div>
          ) : selectedRow && !selectedRow.has_record ? (
            <div className="py-16 text-center space-y-4">
              <p className="text-gray-600 dark:text-slate-300">
                Este paciente ainda não possui prontuário.
              </p>
              <button
                type="button"
                onClick={handleCreateRecord}
                disabled={creatingRecord}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {creatingRecord ? 'Criando prontuário...' : 'Criar prontuário'}
              </button>
            </div>
          ) : recordError ? (
            <div className="py-16 text-center space-y-4">
              <p className="text-gray-600 dark:text-slate-300">Não foi possível carregar o prontuário.</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">{recordError}</p>
              <button
                type="button"
                onClick={() => loadRecord(selectedPatientId)}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800"
              >
                Tentar novamente
              </button>
            </div>
          ) : (
            <div className="py-16 text-center text-gray-500 dark:text-slate-400">Prontuário indisponível.</div>
          )}
        </div>
      </div>

      {cardExportTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 shadow-xl border border-gray-200 dark:border-slate-700">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
                Exportar {cardExportTarget === 'audit' ? 'Auditoria' : 'Histórico de versões'}
              </h3>
              <p className="text-sm text-gray-600 dark:text-slate-300 mt-1">
                Escolha o formato da exportação.
              </p>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleCardExport('pdf')}
                disabled={exportingCard}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                <FileText className="h-4 w-4" /> PDF
              </button>
              <button
                type="button"
                onClick={() => handleCardExport('json')}
                disabled={exportingCard}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-60"
              >
                <Download className="h-4 w-4" /> JSON
              </button>
            </div>
            <div className="px-5 py-4 border-t border-gray-200 dark:border-slate-700 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setCardExportTarget(null)}
                disabled={exportingCard}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedTopic ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white dark:bg-slate-900 shadow-xl border border-gray-200 dark:border-slate-700">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-slate-700">
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">{selectedTopic.sectionTitle}</p>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mt-1">{selectedTopic.title}</h3>
              <p className="text-sm text-gray-600 dark:text-slate-300 mt-1">{selectedTopic.legend}</p>
            </div>

            <div className="p-5 max-h-[70vh] overflow-auto">
              {selectedTopic.id === 'evolution-session-atmosphere' ? (
                <div className="space-y-3">
                  {sessionRows.map((row, index) => (
                    <div key={`${index}-${row.session_number}`} className="rounded-lg border border-gray-200 dark:border-slate-700 p-3 bg-gray-50 dark:bg-slate-800/40">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => toggleSessionRow(index)}
                          className="text-left flex-1"
                        >
                          <p className="text-sm font-medium text-gray-900 dark:text-slate-100">
                            Sessão {row.session_number.trim() || String(index + 1)} · {formatSessionDate(row.session_date)}
                          </p>
                        </button>
                        {sessionRows.length > 1 ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              removeSessionRow(index)
                            }}
                            className="p-1.5 rounded border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                      {expandedSessionRows.includes(index) ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                          <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-800 dark:text-slate-200">Número da Sessão</label>
                            <input
                              type="text"
                              value={row.session_number}
                              onChange={(event) => updateSessionRow(index, 'session_number', event.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-800 dark:text-slate-200">Data da Sessão</label>
                            <input
                              type="date"
                              value={row.session_date}
                              onChange={(event) => updateSessionRow(index, 'session_date', event.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                            />
                          </div>
                          <div className="md:col-span-2 space-y-1">
                            <label className="text-sm font-medium text-gray-800 dark:text-slate-200">Descrição</label>
                            <textarea
                              rows={4}
                              value={row.content}
                              onChange={(event) => updateSessionRow(index, 'content', event.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addSessionRow}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800"
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar sessão
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedTopic.fields.map((field) => (
                    <div
                      key={field.id}
                      className={field.type === 'textarea' ? 'md:col-span-2 space-y-1' : 'space-y-1'}
                    >
                      <label className="text-sm font-medium text-gray-800 dark:text-slate-200">{field.label}</label>
                      {field.type === 'textarea' ? (
                        <textarea
                          rows={6}
                          value={topicValues[field.id] || ''}
                          onChange={(event) => handleTopicValueChange(field.id, event.target.value)}
                          placeholder={field.placeholder || `Preencha ${field.label.toLowerCase()}`}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        />
                      ) : (
                        <input
                          type={field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : 'text'}
                          value={topicValues[field.id] || ''}
                          onChange={(event) => handleTopicValueChange(field.id, event.target.value)}
                          placeholder={field.placeholder || ''}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        />
                      )}
                      {field.patientSource ? (
                        <p className="text-[11px] text-emerald-700 dark:text-emerald-300">Campo pré-carregado do cadastro do paciente.</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-gray-200 dark:border-slate-700 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeTopicModal}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveTopic}
                disabled={savingTopic}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {savingTopic ? 'Salvando...' : 'Salvar tópico'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
