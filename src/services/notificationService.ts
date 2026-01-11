import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { Session } from '../types'

const SESSION_NOTIFICATION_TYPE = 'session_reminder'

const buildSessionNotification = (session: Session, userId: string, includeStatus: boolean) => {
  const patientName = session.patients?.full_name || 'Paciente'
  const scheduledFor = session.session_date
  const dateLabel = session.session_date
    ? format(parseISO(session.session_date), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })
    : ''

  const payload: Record<string, unknown> = {
    user_id: userId,
    patient_id: session.patient_id,
    session_id: session.id,
    notification_type: SESSION_NOTIFICATION_TYPE,
    title: 'Sessao agendada',
    message: dateLabel
      ? `Sessao com ${patientName} em ${dateLabel}.`
      : `Sessao com ${patientName}.`,
    scheduled_for: scheduledFor
  }

  if (includeStatus) {
    payload.status = 'pending'
  }

  return payload
}

const getUserId = async (sessions: Session[], fallback?: string): Promise<string | undefined> => {
  if (fallback) {
    return fallback
  }

  const sessionUserId = sessions.find((session) => session.user_id)?.user_id
  if (sessionUserId) {
    return sessionUserId
  }

  const { data } = await supabase.auth.getUser()
  return data.user?.id
}

export const notificationService = {
  async ensureSessionNotifications(
    sessions: Session[],
    options?: { updateExisting?: boolean; userId?: string }
  ): Promise<void> {
    const eligibleSessions = sessions.filter((session) => session.id && session.patient_id && session.session_date)
    if (eligibleSessions.length === 0) {
      return
    }

    const sessionIds = eligibleSessions.map((session) => session.id)
    const { data: existing, error: existingError } = await supabase
      .from('notifications')
      .select('id, session_id')
      .in('session_id', sessionIds)
      .eq('notification_type', SESSION_NOTIFICATION_TYPE)

    if (existingError) {
      console.error('Error fetching existing notifications:', existingError)
      return
    }

    const existingBySession = new Map(existing?.map((notification) => [notification.session_id, notification]) ?? [])
    const userId = await getUserId(eligibleSessions, options?.userId)

    if (!userId) {
      console.error('Missing user id for notification creation')
      return
    }

    const toInsert: Array<Record<string, unknown>> = []
    const toUpdate: Array<{ id: string; payload: Record<string, unknown> }> = []

    for (const session of eligibleSessions) {
      const existingNotification = existingBySession.get(session.id)
      const payload = buildSessionNotification(session, userId, !existingNotification)

      if (!existingNotification) {
        toInsert.push(payload)
        continue
      }

      if (options?.updateExisting) {
        toUpdate.push({ id: existingNotification.id, payload })
      }
    }

    if (toInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('notifications')
        .insert(toInsert)

      if (insertError) {
        console.error('Error creating notifications:', insertError)
      }
    }

    if (toUpdate.length > 0) {
      await Promise.all(
        toUpdate.map(async (update) => {
          const { error } = await supabase
            .from('notifications')
            .update(update.payload)
            .eq('id', update.id)

          if (error) {
            console.error('Error updating notification:', error)
          }
        })
      )
    }
  }
}
