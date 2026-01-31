import {
  deleteToken,
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type MessagePayload
} from 'firebase/messaging'
import { supabase } from './supabase'
import { getFirebaseApp, isFirebaseConfigured } from './firebase'

const STORAGE_KEY = 'myPsiPushToken'

export type PushSupportStatus = {
  supported: boolean
  reason?: string
}

export type PushSubscriptionStatus = {
  token: string | null
  isEnabled: boolean
  lastSeenAt?: string | null
}

const getBrowserLabel = (userAgent: string) => {
  const ua = userAgent.toLowerCase()
  if (ua.includes('edg/')) return 'Edge'
  if (ua.includes('opr/') || ua.includes('opera')) return 'Opera'
  if (ua.includes('chrome/')) return 'Chrome'
  if (ua.includes('safari/')) return 'Safari'
  if (ua.includes('firefox/')) return 'Firefox'
  return 'Browser'
}

export const getStoredPushToken = () => {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(STORAGE_KEY)
}

const setStoredPushToken = (token: string | null) => {
  if (typeof window === 'undefined') return
  if (!token) {
    window.localStorage.removeItem(STORAGE_KEY)
    return
  }
  window.localStorage.setItem(STORAGE_KEY, token)
}

const getMessagingInstance = async () => {
  if (!isFirebaseConfigured) {
    return null
  }

  const supported = await isSupported()
  if (!supported) {
    return null
  }

  const app = getFirebaseApp()
  if (!app) {
    return null
  }

  return getMessaging(app)
}

const toErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message)
  }
  return 'Falha ao concluir a operacao.'
}

export const getPushErrorMessage = (error: unknown) => {
  const message = toErrorMessage(error)
  if (message.toLowerCase().includes('invalid consent token')) {
    return 'Link de consentimento invalido ou expirado.'
  }
  if (message.toLowerCase().includes('token already linked')) {
    return 'Este dispositivo ja foi vinculado a outro paciente.'
  }
  if (message.toLowerCase().includes('vapid')) {
    return 'VAPID key nao configurada para este portal.'
  }
  return message
}

export const getPushSupportStatus = async (): Promise<PushSupportStatus> => {
  if (typeof window === 'undefined') {
    return { supported: false, reason: 'Ambiente nao suporta notificacoes.' }
  }

  if (!('Notification' in window)) {
    return { supported: false, reason: 'Este navegador nao suporta notificacoes.' }
  }

  if (!('serviceWorker' in navigator)) {
    return { supported: false, reason: 'Seu navegador nao suporta Service Worker.' }
  }

  if (!isFirebaseConfigured) {
    return { supported: false, reason: 'Firebase nao configurado.' }
  }

  const supported = await isSupported()
  if (!supported) {
    return { supported: false, reason: 'Push nao suportado neste dispositivo.' }
  }

  return { supported: true }
}

const ensureServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Worker nao suportado.')
  }
  return navigator.serviceWorker.register('/firebase-messaging-sw.js')
}

export const registerPushToken = async (consentToken: string, meta?: Record<string, unknown>) => {
  if (!consentToken) {
    throw new Error('Token de consentimento ausente.')
  }

  const messaging = await getMessagingInstance()
  if (!messaging) {
    throw new Error('Push nao suportado ou Firebase nao configurado.')
  }

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY
  if (!vapidKey) {
    throw new Error('VAPID key nao configurada.')
  }

  const registration = await ensureServiceWorker()
  let token: string
  try {
    token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration
    })
  } catch (error) {
    throw new Error(`Erro ao obter token FCM: ${toErrorMessage(error)}`)
  }

  if (!token) {
    throw new Error('Falha ao obter token de notificacao.')
  }

  const { error } = await supabase.rpc('register_push_subscription', {
    p_consent_token: consentToken,
    p_token: token,
    p_platform: 'web',
    p_browser: getBrowserLabel(navigator.userAgent),
    p_meta: meta ?? {}
  })

  if (error) {
    throw new Error(`Falha ao salvar assinatura: ${toErrorMessage(error)}`)
  }

  setStoredPushToken(token)
  return token
}

export const disablePushToken = async (consentToken: string) => {
  if (!consentToken) {
    throw new Error('Token de consentimento ausente.')
  }

  const token = getStoredPushToken()
  const messaging = await getMessagingInstance()

  if (messaging) {
    await deleteToken(messaging)
  }

  if (token) {
    const { error } = await supabase.rpc('disable_push_subscription', {
      p_consent_token: consentToken,
      p_token: token,
      p_reason: 'user_disabled'
    })

    if (error) {
      throw error
    }
  }

  setStoredPushToken(null)
}

export const getPushSubscriptionStatus = async (consentToken: string): Promise<PushSubscriptionStatus> => {
  const token = getStoredPushToken()
  if (!token) {
    return { token: null, isEnabled: false }
  }

  const { data, error } = await supabase.rpc('get_push_subscription_status', {
    p_consent_token: consentToken,
    p_token: token
  })

  if (error) {
    throw error
  }

  const row = Array.isArray(data) ? data[0] : data
  return {
    token,
    isEnabled: Boolean(row?.is_enabled),
    lastSeenAt: row?.last_seen_at ?? null
  }
}

export const listenForForegroundMessages = async (
  handler: (payload: MessagePayload) => void
) => {
  const messaging = await getMessagingInstance()
  if (!messaging) {
    return () => {}
  }

  return onMessage(messaging, handler)
}
