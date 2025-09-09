import React, { useState, useEffect } from 'react'
import { sessionService } from '../services/sessionService'
import { patientService } from '../services/patientService'
import { Session, Patient } from '../types'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, User } from 'lucide-react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { utcToZonedTime } from 'date-fns-tz'
import toast from 'react-hot-toast'

// 🔧 Utilitário: força todas as datas a serem interpretadas em UTC
function parseUTC(dateString: string): Date {
  if (!dateString) return new Date()
  // remove o "Z" no final (que força UTC e causa o deslocamento de fuso)
  const clean = dateString.replace(/Z$/, '')
  return parseISO(clean)
}


export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [sessions, setSessions] = useState<Session[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedDateSessions, setSelectedDateSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [currentDate])

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
      toast.error('Erro ao carregar dados do calendário')
    } finally {
      setLoading(false)
    }
  }

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd })

  const getSessionsForDate = (date: Date) => {
    return sessions.filter(session => {
      const sessionDate = parseUTC(session.session_date)
      return isSameDay(sessionDate, date) && session.payment_status !== 'cancelled'
    })
  }

  const handleDateClick = (date: Date) => {
    setSelectedDate(date)
    const dateSessions = getSessionsForDate(date)
    setSelectedDateSessions(dateSessions)
  }

  const handlePreviousMonth = () => {
    setCurrentDate(subMonths(currentDate, 1))
  }

  const handleNextMonth = () => {
    setCurrentDate(addMonths(currentDate, 1))
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
        <h1 className="text-3xl font-bold text-gray-900">Agenda</h1>
        <p className="text-gray-600 mt-2">Visualize e gerencie seus agendamentos.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Calendar */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            {/* Calendar Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePreviousMonth}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={handleNextMonth}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Calendar Grid */}
            <div className="p-6">
              {/* Days of week header */}
              <div className="grid grid-cols-7 gap-1 mb-4">
                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
                  <div key={day} className="p-2 text-center text-sm font-medium text-gray-600">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar days */}
              <div className="grid grid-cols-7 gap-1">
                {monthDays.map(day => {
                  const daySessions = getSessionsForDate(day)
                  const isSelected = selectedDate && isSameDay(day, selectedDate)
                  const isCurrentMonth = isSameMonth(day, currentDate)
                  
                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => handleDateClick(day)}
                      className={`
                        relative p-2 h-20 text-left border border-gray-100 hover:bg-gray-50 transition-colors
                        ${isSelected ? 'bg-blue-50 border-blue-200' : ''}
                        ${!isCurrentMonth ? 'text-gray-400' : ''}
                      `}
                    >
                      <span className={`text-sm font-medium ${
                        isSameDay(day, new Date()) ? 'text-blue-600' : ''
                      }`}>
                        {format(day, 'd')}
                      </span>
                      
                      {daySessions.length > 0 && (
                        <div className="mt-1 space-y-1">
                          {daySessions.slice(0, 2).map((session) => (
                            <div
                              key={session.id}
                              className={`text-xs px-1 py-0.5 rounded truncate ${
                                session.payment_status === 'paid' 
                                  ? 'bg-green-100 text-green-800'
                                  : session.payment_status === 'pending'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {format(parseUTC(session.session_date), 'HH:mm')}
                            </div>
                          ))}
                          {daySessions.length > 2 && (
                            <div className="text-xs text-gray-500">
                              +{daySessions.length - 2} mais
                            </div>
                          )}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Selected Date Sessions */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-gray-400" />
                <h3 className="text-lg font-semibold text-gray-900">
                  {selectedDate 
                    ? format(selectedDate, "dd 'de' MMMM", { locale: ptBR })
                    : 'Selecione uma data'
                  }
                </h3>
              </div>
            </div>
            
            <div className="p-6">
              {selectedDate ? (
                selectedDateSessions.length > 0 ? (
                  <div className="space-y-4">
                    {selectedDateSessions.map(session => (
                      <div key={session.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-gray-400" />
                            <span className="font-medium text-gray-900">
                              {session.patients?.full_name}
                            </span>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            session.payment_status === 'paid' 
                              ? 'bg-green-100 text-green-800'
                              : session.payment_status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {session.payment_status === 'paid' ? 'Pago' : 
                             session.payment_status === 'pending' ? 'Pendente' : 'Cancelado'}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {format(parseUTC(session.session_date), 'HH:mm')}
                          </div>
                          <span>{session.duration_minutes} min</span>
                        </div>
                        
                        <div className="text-sm text-gray-600">
                          {session.session_type}
                        </div>
                        
                        {session.session_price && (
                          <div className="mt-2 text-sm font-medium text-gray-900">
                            R$ {Number(session.session_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <CalendarIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">Nenhuma sessão agendada para este dia</p>
                  </div>
                )
              ) : (
                <div className="text-center py-8">
                  <CalendarIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">Clique em uma data para ver os agendamentos</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
