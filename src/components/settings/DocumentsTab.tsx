import React, { useEffect, useMemo, useRef, useState } from 'react'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import {
  ArrowLeft,
  Eye,
  FilePdf,
  FloppyDisk,
  Folder,
  FolderPlus,
  LinkSimple,
  Plus,
  TextAlignCenter,
  TextAlignJustify,
  TextAlignLeft,
  TextAlignRight,
  TextB,
  TextItalic,
  TextUnderline,
  Trash
} from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import { patientService } from '../../services/patientService'
import { documentService } from '../../services/documentService'
import { profileService } from '../../services/profileService'
import { supabase } from '../../lib/supabase'
import { DocumentFolder, DocumentTemplate, DocumentTemplateAssignment, Patient, Profile } from '../../types'

const vars = [
  ['paciente_nome', 'Nome do paciente'],
  ['frequencia_sessoes', 'Frequencia das sessoes'],
  ['dia_semana_sessao', 'Dia da semana da sessao'],
  ['horario_sessao', 'Horario da sessao'],
  ['assinatura_usuario', 'Assinatura do usuario'],
  ['valor_sessao', 'Valor da sessao'],
  ['qtd_sessoes', 'Quantidade de sessoes'],
  ['qtd_sessoes_pagas', 'Sessoes pagas'],
  ['qtd_sessoes_pendentes', 'Sessoes pendentes'],
  ['profissional_nome', 'Nome do profissional'],
  ['profissional_crp', 'CRP do profissional'],
  ['data_hoje', 'Data de hoje']
] as const

const freq: Record<string, string> = {
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal',
  as_needed: 'Conforme necessario'
}

const weekDays: Record<number, string> = {
  0: 'Domingo',
  1: 'Segunda-feira',
  2: 'Terca-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sabado'
}

const token = (name: string) => `{{${name}}}`
const money = (v?: number | null) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const normalize = (v: string) => v.trim().toLowerCase()
const formatDateLongPtBr = (date: Date) => {
  const day = String(date.getDate())
  const year = String(date.getFullYear())
  const month = date.toLocaleDateString('pt-BR', { month: 'long' })
  const monthCapitalized = month.charAt(0).toUpperCase() + month.slice(1)
  return `${day} de ${monthCapitalized} de ${year}`
}
const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
const toHtml = (value: string) => {
  if (!value) return ''
  if (/<[a-z][\s\S]*>/i.test(value)) return value
  return escapeHtml(value).replace(/\n/g, '<br/>')
}
const buildNewDocumentHtml = (profile?: Profile | null) => {
  const name = profile?.full_name?.trim() || 'Nome do usuario'
  const crp = profile?.crp_number?.trim() ? `CRP ${profile.crp_number.trim()}` : 'numero crp'
  return [
    '<p>Paciente: {{paciente_nome}}</p>',
    '<p>Frequencia: {{frequencia_sessoes}}</p>',
    '<p>Valor: {{valor_sessao}}</p>',
    '<p><br/></p>',
    '<div style="text-align:center;">{{assinatura_usuario}}</div>',
    '<div style="text-align:center;">_____________________________________________</div>',
    `<div style="text-align:center;">${escapeHtml(name)}</div>`,
    `<div style="text-align:center;">${escapeHtml(crp)}</div>`
  ].join('')
}

export default function DocumentsTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [folders, setFolders] = useState<DocumentFolder[]>([])
  const [templates, setTemplates] = useState<DocumentTemplate[]>([])
  const [assignments, setAssignments] = useState<DocumentTemplateAssignment[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [folderName, setFolderName] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [folderId, setFolderId] = useState('')
  const [content, setContent] = useState(buildNewDocumentHtml())
  const [modalType, setModalType] = useState<'assign' | 'generate' | 'preview' | null>(null)
  const [modalTemplateId, setModalTemplateId] = useState<string | null>(null)
  const [patientSearch, setPatientSearch] = useState('')
  const [selectedFolderViewId, setSelectedFolderViewId] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewFileName, setPreviewFileName] = useState('documento.pdf')
  const [fontSize, setFontSize] = useState('14')
  const editorRef = useRef<HTMLDivElement | null>(null)
  const [statsCache, setStatsCache] = useState<Record<string, { total: number; paid: number; pending: number }>>({})

  useEffect(() => {
    ;(async () => {
      try {
        const [f, t, a, p, pr] = await Promise.all([
          documentService.getFolders(),
          documentService.getTemplates(),
          documentService.getAssignments(),
          patientService.getPatients(),
          profileService.getProfile()
        ])
        setFolders(f)
        setTemplates(t)
        setAssignments(a)
        setPatients(p)
        setProfile(pr)
        if (t[0]) {
          setSelectedTemplateId(t[0].id)
          setTitle(t[0].title)
          setFolderId(t[0].folder_id || '')
          setContent(toHtml(t[0].content || ''))
        } else {
          setContent(buildNewDocumentHtml(pr))
        }
      } catch {
        toast.error('Erro ao carregar documentos')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const assignmentsByTemplate = useMemo(() => assignments.reduce<Record<string, DocumentTemplateAssignment[]>>((acc, it) => {
    ;(acc[it.template_id] ||= []).push(it)
    return acc
  }, {}), [assignments])

  const templatesByFolder = useMemo(() => {
    return templates.reduce<Record<string, DocumentTemplate[]>>((acc, template) => {
      const key = template.folder_id || 'sem-pasta'
      ;(acc[key] ||= []).push(template)
      return acc
    }, {})
  }, [templates])

  const templatesForSelectedFolder = useMemo(
    () => (selectedFolderViewId ? (templatesByFolder[selectedFolderViewId] || []) : []),
    [selectedFolderViewId, templatesByFolder]
  )

  const selectedFolderName = useMemo(
    () => folders.find((folder) => folder.id === selectedFolderViewId)?.name || '',
    [folders, selectedFolderViewId]
  )

  const filteredPatients = useMemo(() => {
    const q = normalize(patientSearch)
    if (!q) return patients
    return patients.filter(p => normalize(p.full_name).includes(q))
  }, [patients, patientSearch])

  const resetEditor = () => {
    setSelectedTemplateId(null)
    setTitle('')
    setFolderId('')
    setContent('')
  }

  const selectTemplate = (t: DocumentTemplate) => {
    setSelectedTemplateId(t.id)
    setTitle(t.title)
    setFolderId(t.folder_id || '')
    setContent(toHtml(t.content || ''))
  }

  const createFolder = async () => {
    if (!folderName.trim()) return toast.error('Informe o nome da pasta')
    const { data, error } = await documentService.createFolder(folderName)
    if (error || !data) return toast.error(error?.message || 'Erro ao criar pasta')
    setFolders(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')))
    setFolderName('')
    toast.success('Pasta criada')
  }

  const saveTemplate = async () => {
    if (!title.trim()) return toast.error('Informe o nome do documento')
    if (!folderId) return toast.error('Selecione uma pasta antes de salvar')
    setSaving(true)
    let savedSuccessfully = false
    try {
      if (selectedTemplateId) {
        const { data, error } = await documentService.updateTemplate(selectedTemplateId, { title, folder_id: folderId, content })
        if (error || !data) return toast.error(error?.message || 'Erro ao salvar documento')
        setTemplates(prev => prev.map(it => it.id === data.id ? data : it))
        savedSuccessfully = true
      } else {
        const { data, error } = await documentService.createTemplate({ title, folder_id: folderId, content })
        if (error || !data) return toast.error(error?.message || 'Erro ao criar documento')
        setTemplates(prev => [data, ...prev])
        savedSuccessfully = true
      }
      toast.success('Documento salvo')
      if (savedSuccessfully) {
        resetEditor()
      }
    } finally {
      setSaving(false)
    }
  }

  const deleteTemplate = async (template: DocumentTemplate) => {
    if (!confirm(`Excluir "${template.title}"?`)) return
    const { error } = await documentService.deleteTemplate(template.id)
    if (error) return toast.error(error.message || 'Erro ao excluir documento')
    setTemplates(prev => prev.filter(it => it.id !== template.id))
    setAssignments(prev => prev.filter(it => it.template_id !== template.id))
    if (selectedTemplateId === template.id) resetEditor()
  }

  useEffect(() => {
    if (!editorRef.current) return
    if (editorRef.current.innerHTML !== content) {
      editorRef.current.innerHTML = content
    }
  }, [content, selectedTemplateId])

  const syncEditorContent = () => {
    setContent(editorRef.current?.innerHTML || '')
  }

  const execEditor = (command: string, value?: string) => {
    if (!folderId) return
    editorRef.current?.focus()
    document.execCommand(command, false, value)
    syncEditorContent()
  }

  const applyFontSize = (sizePx: string) => {
    if (!folderId || !editorRef.current) return
    setFontSize(sizePx)
    editorRef.current.focus()
    document.execCommand('fontSize', false, '7')
    editorRef.current.innerHTML = editorRef.current.innerHTML.replace(
      /<font size="7">([\s\S]*?)<\/font>/gi,
      `<span style="font-size:${sizePx}px">$1</span>`
    )
    syncEditorContent()
  }

  const insertToken = (name: string) => {
    if (!folderId) return
    const value = token(name)
    editorRef.current?.focus()
    const ok = document.execCommand('insertText', false, value)
    if (!ok && editorRef.current) {
      editorRef.current.innerHTML += value
    }
    syncEditorContent()
  }

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const getPdfFileName = (template: DocumentTemplate, patient: Patient) =>
    `${(template.title || 'documento').replace(/\s+/g, '-')}-${(patient.full_name || 'paciente').replace(/\s+/g, '-')}.pdf`

  const openPatientModal = (type: 'assign' | 'generate' | 'preview', templateId: string) => {
    setModalType(type)
    setModalTemplateId(templateId)
    setPatientSearch('')
  }

  const getStats = async (patientId: string) => {
    if (statsCache[patientId]) return statsCache[patientId]
    const [total, paid, pending] = await Promise.all([
      supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('patient_id', patientId),
      supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('patient_id', patientId).eq('payment_status', 'paid'),
      supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('patient_id', patientId).eq('payment_status', 'pending')
    ])
    const next = { total: total.count || 0, paid: paid.count || 0, pending: pending.count || 0 }
    setStatsCache(prev => ({ ...prev, [patientId]: next }))
    return next
  }

  const replaceVars = (templateText: string, values: Record<string, string>) =>
    templateText.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, key: string) => values[key] ?? `{{${key}}}`)

  const buildPdf = async (template: DocumentTemplate, patient: Patient) => {
    const stats = await getStats(patient.id)
    const firstSchedule = patient.session_schedules?.[0]
    const values: Record<string, string> = {
      paciente_nome: escapeHtml(patient.full_name || ''),
      frequencia_sessoes: escapeHtml(freq[patient.session_frequency] || patient.session_frequency || ''),
      dia_semana_sessao: escapeHtml(firstSchedule ? (weekDays[firstSchedule.dayOfWeek] || '') : ''),
      horario_sessao: escapeHtml(firstSchedule?.time || ''),
      assinatura_usuario: profile?.signature_data
        ? `<div style="width:100%;text-align:center;"><img src="${profile.signature_data}" alt="Assinatura" style="display:block;margin:0 auto;max-width:160px;max-height:60px;object-fit:contain;" /></div>`
        : '',
      valor_sessao: escapeHtml(money(patient.session_price)),
      qtd_sessoes: String(stats.total),
      qtd_sessoes_pagas: String(stats.paid),
      qtd_sessoes_pendentes: String(stats.pending),
      profissional_nome: escapeHtml(profile?.full_name || ''),
      profissional_crp: escapeHtml(profile?.crp_number ? `CRP ${profile.crp_number}` : ''),
      data_hoje: escapeHtml(formatDateLongPtBr(new Date()))
    }

    const replaced = replaceVars(template.content || '', values)
    const bodyHtml = /<[a-z][\s\S]*>/i.test(replaced) ? replaced : toHtml(replaced)
    const logoHtml = profile?.logo_data
      ? `<div style="margin-bottom:16px;"><img src="${profile.logo_data}" alt="Logo" style="max-width:120px;max-height:70px;object-fit:contain;" /></div>`
      : ''
    const renderHtml = `<div style="font-family:Arial,sans-serif;font-size:12px;line-height:1.5;color:#111;">${logoHtml}${bodyHtml}</div>`

    const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
    const margin = 40
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const printW = pageW - margin * 2
    const printH = pageH - margin * 2

    const mount = document.createElement('div')
    mount.style.position = 'fixed'
    mount.style.left = '-10000px'
    mount.style.top = '0'
    mount.style.pointerEvents = 'none'
    mount.style.width = '760px'
    mount.style.padding = '0'
    mount.style.background = '#ffffff'
    mount.innerHTML = renderHtml
    document.body.appendChild(mount)

    try {
      const canvas = await html2canvas(mount, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      })

      const imgData = canvas.toDataURL('image/png', 1.0)
      const imgW = printW
      const imgH = (canvas.height * imgW) / canvas.width

      const y = margin
      let remainingHeight = imgH
      let sourceOffset = 0

      // Draw first page
      pdf.addImage(imgData, 'PNG', margin, y, imgW, imgH, undefined, 'FAST')
      remainingHeight -= printH
      sourceOffset += printH

      // Additional pages when content exceeds one page
      while (remainingHeight > 0) {
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', margin, margin - sourceOffset, imgW, imgH, undefined, 'FAST')
        remainingHeight -= printH
        sourceOffset += printH
      }
    } finally {
      document.body.removeChild(mount)
    }

    return pdf
  }

  const generatePdf = async (template: DocumentTemplate, patient: Patient) => {
    const pdf = await buildPdf(template, patient)
    pdf.save(getPdfFileName(template, patient))
  }

  const previewPdf = async (template: DocumentTemplate, patient: Patient) => {
    const pdf = await buildPdf(template, patient)
    const blob = pdf.output('blob')
    const url = URL.createObjectURL(blob)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(url)
    setPreviewFileName(getPdfFileName(template, patient))
  }

  const pickPatient = async (patient: Patient) => {
    if (!modalTemplateId || !modalType) return
    const template = templates.find(t => t.id === modalTemplateId)
    if (!template) return

    if (modalType === 'assign') {
      const exists = assignments.some(a => a.template_id === modalTemplateId && a.patient_id === patient.id)
      if (exists) return toast.error('Esse modelo ja foi atribuido para este paciente')
      const { data, error } = await documentService.assignTemplateToPatient(modalTemplateId, patient.id)
      if (error || !data) return toast.error(error?.message || 'Erro ao atribuir')
      setAssignments(prev => [data, ...prev])
      toast.success('Documento atribuido')
    } else if (modalType === 'generate') {
      try {
        await generatePdf(template, patient)
        toast.success('PDF gerado')
      } catch {
        toast.error('Erro ao gerar PDF')
      }
    } else {
      try {
        await previewPdf(template, patient)
      } catch {
        toast.error('Erro ao gerar previsualizacao')
      }
    }

    setModalType(null)
    setModalTemplateId(null)
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Pastas</h3>
            <div className="mt-2 flex gap-2">
              <input value={folderName} onChange={(e) => setFolderName(e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 rounded-lg text-sm" placeholder="Nome da pasta" />
              <button type="button" onClick={createFolder} className="px-3 py-2 bg-emerald-600 text-white rounded-lg"><FolderPlus size={16} weight="bold" /></button>
            </div>
            {!selectedFolderViewId ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {folders.map((folder) => {
                  const total = (templatesByFolder[folder.id] || []).length
                  return (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => setSelectedFolderViewId(folder.id)}
                      className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 px-3 py-3 text-left"
                    >
                      <div className="flex items-start gap-2">
                        <Folder size={16} weight="duotone" className="text-amber-500 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-slate-100 truncate">{folder.name}</p>
                          <p className="text-xs text-gray-500 dark:text-slate-400">{total} documento(s)</p>
                        </div>
                      </div>
                    </button>
                  )
                })}
                {!folders.length && (
                  <p className="col-span-2 text-sm text-gray-500 dark:text-slate-400">Crie uma pasta para comecar.</p>
                )}
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-gray-200 dark:border-slate-700 p-2 space-y-2">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setSelectedFolderViewId('')}
                    className="text-xs px-2 py-1 border border-gray-300 dark:border-slate-600 rounded text-gray-700 dark:text-slate-200"
                  >
                    <span className="inline-flex items-center gap-1">
                      <ArrowLeft size={14} weight="bold" />
                      Voltar
                    </span>
                  </button>
                  <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{selectedFolderName}</p>
                  <button
                    type="button"
                    onClick={() => {
                      resetEditor()
                      setFolderId(selectedFolderViewId)
                      setContent(buildNewDocumentHtml(profile))
                    }}
                    className="inline-flex items-center gap-1 text-xs border border-emerald-300 text-emerald-700 px-2 py-1 rounded"
                  >
                    <Plus size={12} weight="bold" />
                    Novo
                  </button>
                </div>
                <div className="space-y-2 max-h-72 overflow-auto pr-1">
                  {templatesForSelectedFolder.map((t) => (
                    <div key={t.id} className={`rounded-lg border p-3 ${selectedTemplateId === t.id ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30' : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/30'}`}>
                      <button type="button" onClick={() => selectTemplate(t)} className="w-full text-left">
                        <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{t.title}</p>
                      </button>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(assignmentsByTemplate[t.id] || []).map(a => <span key={a.id} className="text-[11px] px-2 py-1 border border-gray-200 dark:border-slate-600 rounded-full text-gray-700 dark:text-slate-300">{a.patients?.full_name || 'Paciente'}</span>)}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button type="button" title="Atribuir ao paciente" aria-label="Atribuir ao paciente" onClick={() => openPatientModal('assign', t.id)} className="h-9 w-9 border border-gray-300 dark:border-slate-600 rounded inline-flex items-center justify-center text-gray-700 dark:text-slate-300"><LinkSimple size={16} weight="bold" /></button>
                        <button type="button" title="Exportar PDF" aria-label="Exportar PDF" onClick={() => openPatientModal('generate', t.id)} className="h-9 w-9 border border-gray-300 dark:border-slate-600 rounded inline-flex items-center justify-center text-gray-700 dark:text-slate-300"><FilePdf size={16} weight="fill" /></button>
                        <button type="button" title="Previsualizar arquivo" aria-label="Previsualizar arquivo" onClick={() => openPatientModal('preview', t.id)} className="h-9 w-9 border border-gray-300 dark:border-slate-600 rounded inline-flex items-center justify-center text-gray-700 dark:text-slate-300"><Eye size={16} weight="duotone" /></button>
                        <button type="button" title="Excluir documento" aria-label="Excluir documento" onClick={() => deleteTemplate(t)} className="h-9 w-9 border border-red-200 text-red-600 rounded inline-flex items-center justify-center"><Trash size={16} weight="bold" /></button>
                      </div>
                    </div>
                  ))}
                  {!templatesForSelectedFolder.length && (
                    <p className="text-sm text-gray-500 dark:text-slate-400">Nenhum documento nessa pasta.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="xl:col-span-2 space-y-4">
          <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nome do documento" className="flex-1 px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 rounded-lg text-sm" />
              <select
                value={folderId}
                onChange={(e) => {
                  const next = e.target.value
                  setFolderId(next)
                  if (!content && next) {
                    setContent(buildNewDocumentHtml(profile))
                  }
                }}
                className="sm:w-64 px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 rounded-lg text-sm"
              >
                <option value="">Escolha uma pasta</option>
                {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              <button type="button" onClick={saveTemplate} disabled={saving} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm"><FloppyDisk size={16} weight="bold" />{saving ? 'Salvando...' : 'Salvar'}</button>
            </div>
            <div className="mt-3 rounded-lg border border-gray-300 dark:border-slate-600 overflow-hidden">
              <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 p-2 text-gray-700 dark:text-slate-200">
                <select
                  value={fontSize}
                  onChange={(e) => applyFontSize(e.target.value)}
                  className="mr-2 h-8 px-2 text-xs border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-950 dark:text-slate-100"
                  title="Tamanho da fonte"
                >
                  <option value="12">12</option>
                  <option value="14">14</option>
                  <option value="16">16</option>
                  <option value="18">18</option>
                  <option value="20">20</option>
                  <option value="24">24</option>
                  <option value="28">28</option>
                </select>
                <button type="button" onClick={() => execEditor('bold')} className="p-2 rounded hover:bg-white dark:hover:bg-slate-800 border border-transparent hover:border-gray-200 dark:hover:border-slate-600" title="Negrito">
                  <TextB size={16} weight="bold" />
                </button>
                <button type="button" onClick={() => execEditor('italic')} className="p-2 rounded hover:bg-white dark:hover:bg-slate-800 border border-transparent hover:border-gray-200 dark:hover:border-slate-600" title="Italico">
                  <TextItalic size={16} weight="bold" />
                </button>
                <button type="button" onClick={() => execEditor('underline')} className="p-2 rounded hover:bg-white dark:hover:bg-slate-800 border border-transparent hover:border-gray-200 dark:hover:border-slate-600" title="Sublinhado">
                  <TextUnderline size={16} weight="bold" />
                </button>
                <span className="mx-1 h-6 w-px bg-gray-300 dark:bg-slate-600" />
                <button type="button" onClick={() => execEditor('justifyLeft')} className="p-2 rounded hover:bg-white dark:hover:bg-slate-800 border border-transparent hover:border-gray-200 dark:hover:border-slate-600" title="Alinhar a esquerda">
                  <TextAlignLeft size={16} weight="bold" />
                </button>
                <button type="button" onClick={() => execEditor('justifyCenter')} className="p-2 rounded hover:bg-white dark:hover:bg-slate-800 border border-transparent hover:border-gray-200 dark:hover:border-slate-600" title="Centralizar">
                  <TextAlignCenter size={16} weight="bold" />
                </button>
                <button type="button" onClick={() => execEditor('justifyRight')} className="p-2 rounded hover:bg-white dark:hover:bg-slate-800 border border-transparent hover:border-gray-200 dark:hover:border-slate-600" title="Alinhar a direita">
                  <TextAlignRight size={16} weight="bold" />
                </button>
                <button type="button" onClick={() => execEditor('justifyFull')} className="p-2 rounded hover:bg-white dark:hover:bg-slate-800 border border-transparent hover:border-gray-200 dark:hover:border-slate-600" title="Justificar">
                  <TextAlignJustify size={16} weight="bold" />
                </button>
              </div>
              <div
                ref={editorRef}
                contentEditable={Boolean(folderId)}
                suppressContentEditableWarning
                onInput={syncEditorContent}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const raw = e.dataTransfer.getData('text/plain')
                  if (!raw) return
                  const clean = raw.replace(/[{}]/g, '')
                  insertToken(clean)
                }}
                className={`min-h-[360px] w-full px-3 py-3 text-sm focus:outline-none ${
                  folderId
                    ? 'bg-white dark:bg-slate-950 text-gray-900 dark:text-slate-100'
                    : 'bg-gray-50 dark:bg-slate-900 text-gray-400 dark:text-slate-500'
                }`}
              />
            </div>
            {!folderId && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                Escolha uma pasta para comecar a redigir o documento.
              </p>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Variaveis amigaveis (arraste para o documento)</h3>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
              {vars.map(([k, l]) => (
                <button key={k} type="button" draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', token(k))} onClick={() => insertToken(k)} className="text-left px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-gray-50 dark:bg-slate-900 hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
                  <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{l}</p>
                  <p className="text-xs text-emerald-700 font-mono mt-1">{token(k)}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {modalType && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-md w-full shadow-lg border border-gray-200 dark:border-slate-700">
            <div className="p-5 border-b border-gray-200 dark:border-slate-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100">
                {modalType === 'assign' ? 'Atribuir documento' : modalType === 'generate' ? 'Gerar PDF por paciente' : 'Previsualizar PDF'}
              </h3>
              <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">Digite o nome para localizar.</p>
            </div>
            <div className="p-5 space-y-3">
              <input value={patientSearch} onChange={(e) => setPatientSearch(e.target.value)} placeholder="Nome do paciente" className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 rounded-lg text-sm" />
              <div className="max-h-64 overflow-auto space-y-2">
                {filteredPatients.map(p => <button key={p.id} type="button" onClick={() => pickPatient(p)} className="w-full text-left px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-sm text-gray-800 dark:text-slate-200">{p.full_name}</button>)}
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-200 dark:border-slate-700 flex justify-end">
              <button type="button" onClick={() => setModalType(null)} className="px-4 py-2 text-sm bg-gray-100 dark:bg-slate-800 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {previewUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white dark:bg-slate-900 rounded-xl w-full max-w-5xl h-[90vh] shadow-lg border border-gray-200 dark:border-slate-700 flex flex-col">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100">Previsualizacao do documento</h3>
              <div className="flex items-center gap-2">
                <a
                  href={previewUrl}
                  download={previewFileName}
                  className="px-3 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                >
                  Baixar PDF
                </a>
                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(previewUrl)
                    setPreviewUrl(null)
                  }}
                  className="px-3 py-2 text-sm bg-gray-100 dark:bg-slate-800 dark:text-slate-200 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700"
                >
                  Fechar
                </button>
              </div>
            </div>
            <div className="flex-1 bg-gray-100 dark:bg-slate-950 p-3">
              <iframe title="Previsualizacao PDF" src={previewUrl} className="w-full h-full rounded border border-gray-300 dark:border-slate-700 bg-white" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
