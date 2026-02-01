import { addMinutes, parseISO } from 'date-fns'
import { Session } from '../types'

type ConflictCheckOptions = {
  excludeSessionId?: string
}

export const DEFAULT_SESSION_DURATION_MINUTES = 50
const SESSION_BUFFER_MINUTES = 1

type SessionSlot = {
  session: Session
  start: Date
  end: Date
}

const parseSessionDate = (value: string) => {
  return parseISO(value)
}

const buildSessionSlots = (sessions: Session[], options: ConflictCheckOptions): SessionSlot[] => {
  return sessions
    .filter((session) => {
      if (options.excludeSessionId && session.id === options.excludeSessionId) {
        return false
      }
      return session.payment_status !== 'cancelled'
    })
    .map((session) => {
      const start = parseSessionDate(session.session_date)
      const duration = session.duration_minutes ?? DEFAULT_SESSION_DURATION_MINUTES
      const end = addMinutes(start, duration)
      return { session, start, end }
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime())
}

export const findSessionConflict = (
  sessions: Session[],
  candidateStart: Date,
  options: ConflictCheckOptions = {}
) => {
  const candidateEnd = addMinutes(candidateStart, DEFAULT_SESSION_DURATION_MINUTES)
  const slots = buildSessionSlots(sessions, options)

  const conflict = slots.find((slot) => {
    const bufferedEnd = addMinutes(slot.end, SESSION_BUFFER_MINUTES)
    return candidateStart < bufferedEnd && candidateEnd > slot.start
  })

  return conflict?.session
}

export const getFirstAvailableSessionStart = (
  sessions: Session[],
  candidateStart: Date,
  options: ConflictCheckOptions = {}
) => {
  const slots = buildSessionSlots(sessions, options)
  let cursor = candidateStart

  for (const slot of slots) {
    const bufferedEnd = addMinutes(slot.end, SESSION_BUFFER_MINUTES)
    if (bufferedEnd <= cursor) {
      continue
    }

    const cursorEnd = addMinutes(cursor, DEFAULT_SESSION_DURATION_MINUTES)
    if (cursorEnd <= slot.start) {
      return cursor
    }

    if (cursor < bufferedEnd && cursorEnd > slot.start) {
      cursor = bufferedEnd
    }
  }

  return cursor
}
