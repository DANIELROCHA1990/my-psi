/// <reference path="../deno.d.ts" />
import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'https://esm.sh/pdf-lib@1.17.1'
import { corsHeaders } from '../_shared/cors.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'
import { getBearerToken, requireAuth } from '../_shared/auth.ts'
import { ensurePatientOwnership, ensureMedicalRecord } from '../_shared/medical.ts'
import { decryptPayload, encryptPayload } from '../_shared/crypto.ts'
import { writeMedicalAudit } from '../_shared/audit.ts'
import { getAdminClient } from '../_shared/supabase.ts'
import { PSIFORM_TOPICS_META } from '../_shared/psiform-topics.ts'

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN_X = 40
const MARGIN_TOP = 45
const MARGIN_BOTTOM = 45
const APP_TIMEZONE = 'America/Sao_Paulo'

type TopicPayload = {
  template_topic_id?: string
  template_topic_title?: string
  template_section_id?: string
  template_section_title?: string
  legend?: string
  text?: string
  fields?: Record<string, unknown>
  imported_patient_snapshot?: Record<string, unknown>
}

type PatientIdentity = {
  full_name?: string | null
  birth_date?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
}

type ProfileIdentity = {
  full_name?: string | null
  crp_number?: string | null
  signature_data?: string | null
  logo_data?: string | null
}

type EmbeddedImage = {
  bytes: Uint8Array
  format: 'png' | 'jpg'
}

const trim = (value: unknown) => {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

const toShortDate = (value: string) => {
  if (!value) return ''
  const ymd = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (ymd) {
    return `${ymd[3]}/${ymd[2]}/${ymd[1]}`
  }
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})T/)
  if (iso) {
    return `${iso[3]}/${iso[2]}/${iso[1]}`
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('pt-BR', { timeZone: APP_TIMEZONE })
}

const formatBrazilDateTime = (date: Date) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: APP_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date)

const parseDataUrlImage = (dataUrl: string | null | undefined): EmbeddedImage | null => {
  const value = trim(dataUrl)
  if (!value) return null
  const match = value.match(/^data:(image\/(?:png|jpe?g));base64,([A-Za-z0-9+/=\s]+)$/i)
  if (!match) return null

  try {
    const mime = match[1].toLowerCase()
    const base64 = match[2].replace(/\s+/g, '')
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }

    return {
      bytes,
      format: mime.includes('png') ? 'png' : 'jpg'
    }
  } catch (_error) {
    return null
  }
}

const wrapText = (text: string, maxWidth: number, font: PDFFont, size: number) => {
  const lines: string[] = []
  const paragraphs = text.split(/\r?\n/)

  for (const paragraph of paragraphs) {
    const content = paragraph.trim()
    if (!content) {
      lines.push('')
      continue
    }

    const words = content.split(/\s+/)
    let line = words[0] || ''

    for (let i = 1; i < words.length; i += 1) {
      const candidate = `${line} ${words[i]}`
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate
      } else {
        lines.push(line)
        line = words[i]
      }
    }

    lines.push(line)
  }

  return lines
}

type PdfCursor = {
  page: PDFPage
  y: number
}

const addPage = (pdfDoc: PDFDocument): PdfCursor => ({
  page: pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
  y: PAGE_HEIGHT - MARGIN_TOP
})

const ensureSpace = (pdfDoc: PDFDocument, cursor: PdfCursor, requiredHeight: number): PdfCursor => {
  if (cursor.y - requiredHeight < MARGIN_BOTTOM) {
    return addPage(pdfDoc)
  }
  return cursor
}

const drawWrapped = (
  pdfDoc: PDFDocument,
  cursor: PdfCursor,
  text: string,
  options: {
    font: PDFFont
    size: number
    color?: ReturnType<typeof rgb>
    indent?: number
    lineGap?: number
  }
) => {
  const indent = options.indent || 0
  const lineGap = options.lineGap ?? 3
  const lineHeight = options.size + lineGap
  const color = options.color || rgb(0.12, 0.12, 0.12)
  const maxWidth = PAGE_WIDTH - MARGIN_X * 2 - indent
  const lines = wrapText(text, maxWidth, options.font, options.size)
  let nextCursor = cursor

  for (const line of lines) {
    nextCursor = ensureSpace(pdfDoc, nextCursor, lineHeight)
    if (line) {
      nextCursor.page.drawText(line, {
        x: MARGIN_X + indent,
        y: nextCursor.y,
        size: options.size,
        font: options.font,
        color
      })
    }
    nextCursor.y -= lineHeight
  }

  return nextCursor
}

const drawCenteredWrapped = (
  pdfDoc: PDFDocument,
  cursor: PdfCursor,
  text: string,
  options: {
    font: PDFFont
    size: number
    color?: ReturnType<typeof rgb>
    lineGap?: number
  }
) => {
  const lineGap = options.lineGap ?? 3
  const lineHeight = options.size + lineGap
  const color = options.color || rgb(0.12, 0.12, 0.12)
  const maxWidth = PAGE_WIDTH - MARGIN_X * 2
  const lines = wrapText(text, maxWidth, options.font, options.size)
  let nextCursor = cursor

  for (const line of lines) {
    nextCursor = ensureSpace(pdfDoc, nextCursor, lineHeight)
    if (line) {
      const textWidth = options.font.widthOfTextAtSize(line, options.size)
      const x = Math.max(MARGIN_X, (PAGE_WIDTH - textWidth) / 2)
      nextCursor.page.drawText(line, {
        x,
        y: nextCursor.y,
        size: options.size,
        font: options.font,
        color
      })
    }
    nextCursor.y -= lineHeight
  }

  return nextCursor
}

const drawGap = (pdfDoc: PDFDocument, cursor: PdfCursor, height: number) => {
  const nextCursor = ensureSpace(pdfDoc, cursor, height)
  nextCursor.y -= height
  return nextCursor
}

const drawCenteredImage = async (
  pdfDoc: PDFDocument,
  cursor: PdfCursor,
  imageDataUrl: string | null | undefined,
  maxWidth: number,
  maxHeight: number
) => {
  const parsed = parseDataUrlImage(imageDataUrl)
  if (!parsed) return cursor

  const image = parsed.format === 'png'
    ? await pdfDoc.embedPng(parsed.bytes)
    : await pdfDoc.embedJpg(parsed.bytes)

  const ratio = Math.min(maxWidth / image.width, maxHeight / image.height, 1)
  const width = image.width * ratio
  const height = image.height * ratio
  let nextCursor = ensureSpace(pdfDoc, cursor, height + 2)
  const x = (PAGE_WIDTH - width) / 2
  nextCursor.page.drawImage(image, {
    x,
    y: nextCursor.y - height,
    width,
    height
  })
  nextCursor.y -= height + 6
  return nextCursor
}

const drawEmptyLine = (pdfDoc: PDFDocument, cursor: PdfCursor, indent = 12) => {
  const lineHeight = 14
  let nextCursor = ensureSpace(pdfDoc, cursor, lineHeight)
  const yLine = nextCursor.y - 2
  nextCursor.page.drawLine({
    start: { x: MARGIN_X + indent, y: yLine },
    end: { x: PAGE_WIDTH - MARGIN_X, y: yLine },
    thickness: 0.6,
    color: rgb(0.75, 0.75, 0.75)
  })
  nextCursor.y -= lineHeight
  return nextCursor
}

const collectTopicContent = (
  topicMeta: (typeof PSIFORM_TOPICS_META)[number],
  payload: TopicPayload | null,
  patientIdentity: PatientIdentity
) => {
  const importedSnapshot = asObject(payload?.imported_patient_snapshot)
  const fields = asObject(payload?.fields)
  const lines: string[] = []
  const usedFields = new Set<string>()

  if (topicMeta.id === 'identification-core') {
    for (const field of topicMeta.fields) {
      const valueRaw =
        trim(fields[field.id]) ||
        trim(importedSnapshot[field.id]) ||
        trim(patientIdentity[field.id as keyof PatientIdentity])
      const value = field.id === 'birth_date' ? toShortDate(valueRaw) : valueRaw
      if (!value) continue
      usedFields.add(field.id)
      lines.push(`${field.label}: ${value}`)
    }

    for (const [key, value] of Object.entries(fields)) {
      if (usedFields.has(key)) continue
      const cleanValue = trim(value)
      if (cleanValue) {
        lines.push(`${key}: ${cleanValue}`)
      }
    }

    for (const [key, value] of Object.entries(importedSnapshot)) {
      if (usedFields.has(key)) continue
      const cleanValue = trim(value)
      if (cleanValue) {
        lines.push(`${key}: ${cleanValue}`)
      }
    }

    return { hasContent: lines.length > 0, lines, sessionRows: [] as Array<{ header: string; content: string }> }
  }

  if (topicMeta.id === 'evolution-session-atmosphere') {
    const rowsRaw = Array.isArray(fields.session_rows) ? fields.session_rows : []
    const sessionRows = rowsRaw
      .map((row) => asObject(row))
      .map((row, index) => {
        const number = trim(row.session_number)
        const date = toShortDate(trim(row.session_date))
        const content = trim(row.content)
        const labelNumber = number || String(index + 1)
        const labelDate = date || 'sem data'
        return {
          hasAny: Boolean(number || date || content),
          header: `Sessão ${labelNumber} - ${labelDate}`,
          content
        }
      })
      .filter((row) => row.hasAny)

    if (!sessionRows.length) {
      const legacyContent = trim(fields.content) || trim(payload?.text)
      if (legacyContent) {
        return {
          hasContent: true,
          lines: [],
          sessionRows: [
            {
              header: `Sessão ${trim(fields.session_number) || '1'} - ${toShortDate(trim(fields.session_date)) || 'sem data'}`,
              content: legacyContent
            }
          ]
        }
      }
    }

    return { hasContent: sessionRows.some((row) => row.content.length > 0), lines: [] as string[], sessionRows }
  }

  if (!payload) {
    return { hasContent: false, lines: [] as string[], sessionRows: [] as Array<{ header: string; content: string }> }
  }

  for (const field of topicMeta.fields) {
    const rawValue = trim(fields[field.id])
    if (!rawValue) continue
    usedFields.add(field.id)
    if (topicMeta.fields.length === 1) {
      lines.push(rawValue)
    } else {
      lines.push(`${field.label}: ${rawValue}`)
    }
  }

  const fallbackText = trim(payload.text)
  if (fallbackText && !lines.includes(fallbackText)) {
    lines.push(fallbackText)
  }

  for (const [key, value] of Object.entries(fields)) {
    if (usedFields.has(key)) continue
    if (key === 'session_rows' || key === 'sessions_count') continue
    const cleanValue = trim(value)
    if (cleanValue) {
      lines.push(`${key}: ${cleanValue}`)
    }
  }

  return { hasContent: lines.length > 0, lines, sessionRows: [] as Array<{ header: string; content: string }> }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return errorResponse('method_not_allowed', 405)
  }

  const body = await req.json().catch(() => ({}))
  const token = getBearerToken(req)

  try {
    const auth = await requireAuth(token)
    const patientId = typeof body?.patientId === 'string' ? body.patientId.trim() : ''
    const purpose = typeof body?.purpose === 'string' ? body.purpose.trim() : ''

    if (!patientId) {
      return errorResponse('missing_patient_id', 400)
    }

    await ensurePatientOwnership(auth.userId, patientId)
    const record = await ensureMedicalRecord(auth.userId, patientId)

    const admin = getAdminClient()

    const { data: patientData } = await admin
      .from('patients')
      .select('full_name,birth_date,address,phone,email')
      .eq('id', patientId)
      .eq('user_id', auth.userId)
      .maybeSingle()

    const { data: profileData } = await admin
      .from('profiles')
      .select('full_name,crp_number,signature_data,logo_data')
      .eq('user_id', auth.userId)
      .maybeSingle()
    const profile = (profileData as ProfileIdentity | null) || null

    const { data: entries, error: entriesError } = await admin
      .schema('clinical')
      .from('medical_record_entries')
      .select('id,entry_type,event_at,content_enc')
      .eq('medical_record_id', record.id)
      .eq('user_id', auth.userId)
      .eq('is_deleted', false)
      .order('event_at', { ascending: false })
      .limit(500)

    if (entriesError) {
      throw new Error('entries_query_failed')
    }

    const payloadByTopic = new Map<string, TopicPayload>()
    for (const entry of entries || []) {
      const payload = await decryptPayload(entry.content_enc, {
        userId: auth.userId,
        patientId,
        medicalRecordId: record.id,
        resourceType: entry.entry_type,
        resourceId: entry.id
      })
      const payloadObj = asObject(payload) as TopicPayload
      const topicId = trim(payloadObj.template_topic_id)
      if (topicId && !payloadByTopic.has(topicId)) {
        payloadByTopic.set(topicId, payloadObj)
      }
    }

    const pdfDoc = await PDFDocument.create()
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    let cursor = addPage(pdfDoc)

    cursor = await drawCenteredImage(pdfDoc, cursor, profile?.logo_data, 120, 70)
    cursor = drawGap(pdfDoc, cursor, 10)
    cursor = drawCenteredWrapped(pdfDoc, cursor, 'PRONTUÁRIO PSICOLÓGICO', {
      font: fontBold,
      size: 16
    })
    cursor = drawGap(pdfDoc, cursor, 12)
    cursor = drawWrapped(pdfDoc, cursor, `Paciente: ${trim(patientData?.full_name) || 'Paciente'}`, {
      font: fontRegular,
      size: 10
    })
    cursor = drawWrapped(pdfDoc, cursor, `Data de geração: ${formatBrazilDateTime(new Date())}`, {
      font: fontRegular,
      size: 10
    })
    cursor = drawGap(pdfDoc, cursor, 20)

    let currentSectionId = ''
    for (const topic of PSIFORM_TOPICS_META) {
      if (topic.sectionId !== currentSectionId) {
        currentSectionId = topic.sectionId
        cursor = drawGap(pdfDoc, cursor, 4)
        cursor = drawWrapped(pdfDoc, cursor, `${topic.sectionTitle}:`, {
          font: fontBold,
          size: 12,
          color: rgb(0.06, 0.31, 0.26)
        })
        cursor = drawGap(pdfDoc, cursor, 3)
      }

      cursor = drawWrapped(pdfDoc, cursor, `${topic.title}:`, {
        font: fontBold,
        size: 10.5
      })
      cursor = drawWrapped(pdfDoc, cursor, topic.legend, {
        font: fontRegular,
        size: 9,
        color: rgb(0.33, 0.33, 0.33),
        indent: 8
      })

      const content = collectTopicContent(topic, payloadByTopic.get(topic.id) || null, patientData || {})

      if (topic.id === 'evolution-session-atmosphere' && content.sessionRows.length > 0) {
        for (const row of content.sessionRows) {
          cursor = drawWrapped(pdfDoc, cursor, row.header, {
            font: fontBold,
            size: 9.5,
            indent: 12
          })
          if (row.content) {
            cursor = drawWrapped(pdfDoc, cursor, row.content, {
              font: fontRegular,
              size: 9.5,
              indent: 16
            })
          } else {
            cursor = drawEmptyLine(pdfDoc, cursor, 16)
          }
          cursor = drawGap(pdfDoc, cursor, 2)
        }
      } else if (content.hasContent) {
        for (const line of content.lines) {
          cursor = drawWrapped(pdfDoc, cursor, line, {
            font: fontRegular,
            size: 9.5,
            indent: 12
          })
        }
      } else {
        cursor = drawEmptyLine(pdfDoc, cursor, 12)
      }

      cursor = drawGap(pdfDoc, cursor, 6)
    }

    cursor = drawGap(pdfDoc, cursor, 8)
    cursor = await drawCenteredImage(pdfDoc, cursor, profile?.signature_data, 160, 60)
    const professionalName = trim(profile?.full_name)
    if (professionalName) {
      cursor = drawCenteredWrapped(pdfDoc, cursor, professionalName, {
        font: fontRegular,
        size: 10
      })
    }
    const professionalCrp = trim(profile?.crp_number)
    if (professionalCrp) {
      cursor = drawCenteredWrapped(pdfDoc, cursor, `CRP: ${professionalCrp}`, {
        font: fontRegular,
        size: 10
      })
    }

    const bytes = await pdfDoc.save()
    const exportId = crypto.randomUUID()
    const objectPath = `u/${auth.userId}/p/${patientId}/r/${record.id}/medical-document-${exportId}.pdf`

    const { error: uploadError } = await admin
      .storage
      .from('clinical-exports-private')
      .upload(objectPath, new Blob([bytes], { type: 'application/pdf' }), {
        contentType: 'application/pdf',
        upsert: true
      })

    if (uploadError) {
      throw new Error('pdf_upload_failed')
    }

    const encryptedDoc = await encryptPayload({
      title: body?.title || 'Documento de prontuario',
      generatedAt: new Date().toISOString(),
      entryCount: (entries || []).length
    }, {
      userId: auth.userId,
      patientId,
      medicalRecordId: record.id,
      resourceType: 'document_export',
      resourceId: exportId
    })

    await admin.schema('clinical').from('medical_record_documents').insert({
      id: exportId,
      medical_record_id: record.id,
      user_id: auth.userId,
      patient_id: patientId,
      document_type: 'clinical_pdf_export',
      sensitivity_level: 'clinical',
      generated_pdf_path: objectPath,
      document_text_enc: encryptedDoc.enc,
      payload_sha256: encryptedDoc.sha,
      crypto_version: encryptedDoc.version,
      generated_by: auth.userId
    })

    await admin.schema('clinical').from('medical_record_export_log').insert({
      user_id: auth.userId,
      actor_user_id: auth.userId,
      patient_id: patientId,
      medical_record_id: record.id,
      export_type: 'pdf',
      file_path: objectPath,
      export_reason: purpose || null,
      result: 'success'
    })

    const { data: signedData } = await admin
      .storage
      .from('clinical-exports-private')
      .createSignedUrl(objectPath, 120)

    await writeMedicalAudit({
      userId: auth.userId,
      actorUserId: auth.userId,
      patientId,
      medicalRecordId: record.id,
      resourceType: 'medical_record_document',
      resourceId: exportId,
      action: 'generate_pdf',
      purpose,
      origin: 'generate-medical-document-pdf',
      userAgent: req.headers.get('user-agent'),
      result: 'success'
    })

    return jsonResponse({
      ok: true,
      documentId: exportId,
      path: objectPath,
      signedUrl: signedData?.signedUrl || null,
      expiresIn: 120
    })
  } catch (error) {
    const message = String((error as Error)?.message || 'internal_error')
    if (message === 'missing_auth_token' || message === 'unauthorized') {
      return errorResponse('unauthorized', 401)
    }
    if (message === 'patient_not_found_or_forbidden') {
      return errorResponse('forbidden', 403)
    }
    return errorResponse('failed_to_generate_pdf', 500)
  }
})

