import { addMinutes, parseISO } from 'date-fns'
import { Session } from '../types'

type ConflictCheckOptions = {
  excludeSessionId?: string
}

export const findSessionConflict = (
  sessions: Session[],
  candidateStart: Date,
  candidateDurationMinutes: number,
  options: ConflictCheckOptions = {}
) => {
  const candidateEnd = addMinutes(candidateStart, candidateDurationMinutes)

  return sessions.find((session) => {
    if (options.excludeSessionId && session.id === options.excludeSessionId) {
      return false
    }

    if (session.payment_status === 'cancelled') {
      return false
    }

    const sessionStart = parseISO(session.session_date)
    const sessionDuration = session.duration_minutes ?? 50
    const sessionEnd = addMinutes(sessionStart, sessionDuration)

    return candidateStart < sessionEnd && candidateEnd > sessionStart
  })
}
