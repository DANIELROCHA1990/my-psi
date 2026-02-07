import React from 'react'
import { createPortal } from 'react-dom'

type ConflictModalProps = {
  open: boolean
  patientName: string
  firstAvailableTime: string
  onClose: () => void
}

export default function ConflictModal({
  open,
  patientName,
  firstAvailableTime,
  onClose
}: ConflictModalProps) {
  if (!open) {
    return null
  }

  if (typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[80]">
      <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Conflito de horário</h3>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-700">
            O paciente <span className="font-semibold">{patientName}</span> está agendado neste horário.
            Agende no primeiro horário disponível a partir das <span className="font-semibold">{firstAvailableTime}</span>.
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Entendi
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
