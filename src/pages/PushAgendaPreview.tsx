import React, { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Calendar as CalendarIcon, Clock } from '../lib/icons'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const STATUS_LABELS: Record<string, string> = {
  paid: 'Pago',
  pending: 'Pendente',
  cancelled: 'Cancelado'
}

const STATUS_STYLES: Record<string, string> = {
  paid: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-gray-200 text-gray-700'
}

const formatDateLabel = (dateString: string) => {
  if (!dateString) return 'Data não informada'
  const parsed = parseISO(dateString)
  if (Number.isNaN(parsed.getTime())) {
    return dateString
  }
  return format(parsed, "dd 'de' MMMM", { locale: ptBR })
}

const formatCurrency = (value: string) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return parsed.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function PushAgendaPreview() {
  const [searchParams] = useSearchParams()

  const data = useMemo(() => {
    return {
      date: searchParams.get('date') || '',
      time: searchParams.get('time') || '',
      duration: searchParams.get('duration') || '50',
      status: searchParams.get('status') || 'pending',
      type: searchParams.get('type') || 'Sessão Individual',
      price: searchParams.get('price') || '',
      patient: searchParams.get('patient') || 'Paciente'
    }
  }, [searchParams])

  const statusLabel = STATUS_LABELS[data.status] || 'Pendente'
  const statusClass = STATUS_STYLES[data.status] || STATUS_STYLES.pending
  const priceLabel = formatCurrency(data.price)

  return (
    <div className="min-h-screen bg-[#0b1120] text-white flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0f172a] shadow-2xl">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10">
          <CalendarIcon className="h-5 w-5 text-emerald-300" />
          <h1 className="text-lg font-semibold">{formatDateLabel(data.date)}</h1>
        </div>

        <div className="p-6">
          <div className="rounded-xl border border-white/10 bg-[#0b1223] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <span className="text-base font-semibold">{data.patient}</span>
              </div>
              <span className={`px-3 py-1 text-xs font-semibold rounded-full ${statusClass}`}>
                {statusLabel}
              </span>
            </div>

            <div className="mt-4 space-y-2 text-sm text-slate-200">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-emerald-300" />
                <span>{data.time || '--:--'}</span>
                <span className="text-slate-400">{data.duration} min</span>
              </div>
              <div>{data.type}</div>
              {priceLabel && <div className="font-semibold">{priceLabel}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
