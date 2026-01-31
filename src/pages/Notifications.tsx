import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  disablePushToken,
  getPushSubscriptionStatus,
  getPushSupportStatus,
  listenForForegroundMessages,
  registerPushToken
} from '../lib/pushSubscription'
import { isFirebaseConfigured } from '../lib/firebase'

const PERMISSION_LABELS: Record<NotificationPermission, string> = {
  default: 'Nao definido',
  denied: 'Negado',
  granted: 'Concedido'
}

export default function Notifications() {
  const [searchParams] = useSearchParams()
  const consentToken = useMemo(() => {
    return searchParams.get('consent') || searchParams.get('token') || ''
  }, [searchParams])

  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [supported, setSupported] = useState<boolean | null>(null)
  const [supportReason, setSupportReason] = useState<string | null>(null)
  const [subscribed, setSubscribed] = useState(false)
  const [checking, setChecking] = useState(false)
  const [working, setWorking] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null)

  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setPermission(Notification.permission)
    }
  }, [])

  useEffect(() => {
    let active = true

    const checkSupport = async () => {
      const support = await getPushSupportStatus()
      if (!active) return
      setSupported(support.supported)
      setSupportReason(support.reason ?? null)
    }

    checkSupport()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    const loadStatus = async () => {
      if (!consentToken) {
        setStatusMessage('Link de consentimento nao encontrado.')
        return
      }

      if (supported === false) {
        setStatusMessage(supportReason || 'Notificacoes nao suportadas neste dispositivo.')
        return
      }

      if (supported === null) {
        return
      }

      setChecking(true)
      try {
        const status = await getPushSubscriptionStatus(consentToken)
        if (!active) return
        setSubscribed(status.isEnabled)
        setLastSeenAt(status.lastSeenAt)
        setStatusMessage(status.isEnabled ? 'Lembretes ativados.' : 'Lembretes ainda nao ativados.')
      } catch (error) {
        console.error('Erro ao verificar push:', error)
        if (!active) return
        setStatusMessage('Nao foi possivel verificar a assinatura agora.')
      } finally {
        if (active) setChecking(false)
      }
    }

    loadStatus()

    return () => {
      active = false
    }
  }, [consentToken, supported, supportReason])

  useEffect(() => {
    let unsubscribe = () => {}
    if (permission === 'granted') {
      listenForForegroundMessages((payload) => {
        const title = payload.notification?.title || 'Lembrete de consulta'
        const body = payload.notification?.body || ''
        toast.success(`${title}${body ? ` - ${body}` : ''}`)
      }).then((unsub) => {
        unsubscribe = unsub
      })
    }

    return () => {
      unsubscribe()
    }
  }, [permission])

  const handleEnable = async () => {
    if (!consentToken) {
      toast.error('Link de consentimento invalido.')
      return
    }

    if (!isFirebaseConfigured) {
      toast.error('Firebase nao configurado neste portal.')
      return
    }

    setWorking(true)
    try {
      const result = await Notification.requestPermission()
      setPermission(result)

      if (result !== 'granted') {
        toast.error('Permissao de notificacao negada.')
        setStatusMessage('Permissao negada. Ative nas configuracoes do navegador.')
        return
      }

      await registerPushToken(consentToken, { source: 'portal' })
      setSubscribed(true)
      setStatusMessage('Lembretes ativados com sucesso!')
      toast.success('Lembretes ativados')
    } catch (error) {
      console.error('Erro ao ativar push:', error)
      toast.error('Falha ao ativar lembretes')
    } finally {
      setWorking(false)
    }
  }

  const handleDisable = async () => {
    if (!consentToken) {
      toast.error('Link de consentimento invalido.')
      return
    }

    setWorking(true)
    try {
      await disablePushToken(consentToken)
      setSubscribed(false)
      setStatusMessage('Lembretes desativados.')
      toast.success('Lembretes desativados')
    } catch (error) {
      console.error('Erro ao desativar push:', error)
      toast.error('Falha ao desativar lembretes')
    } finally {
      setWorking(false)
    }
  }

  const renderPermissionHelp = () => {
    if (permission !== 'denied') return null
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
        Para ativar, abra as configuracoes do navegador, permita notificacoes para este site e recarregue a pagina.
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-gray-900">Lembretes de consulta</h1>
            <p className="text-gray-600">
              Voce vai receber lembretes de consulta no navegador deste dispositivo. Voce pode desativar quando quiser.
            </p>
          </div>

          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-700">
                Permissao: {PERMISSION_LABELS[permission]}
              </span>
              <span
                className={`px-3 py-1 rounded-full ${
                  supported === null
                    ? 'bg-gray-100 text-gray-600'
                    : supported
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {supported === null ? 'Verificando suporte' : supported ? 'Suporte ativo' : 'Sem suporte'}
              </span>
              {lastSeenAt && (
                <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-700">
                  Ultima atualizacao: {new Date(lastSeenAt).toLocaleString('pt-BR')}
                </span>
              )}
            </div>

            {supportReason && !supported && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {supportReason}
              </div>
            )}

            {renderPermissionHelp()}

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
              {checking ? 'Verificando sua inscricao...' : statusMessage}
            </div>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={handleEnable}
              disabled={working || subscribed || supported === false}
              className="flex-1 px-4 py-3 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-60"
            >
              {working ? 'Ativando...' : subscribed ? 'Lembretes ativados' : 'Ativar lembretes'}
            </button>
            <button
              type="button"
              onClick={handleDisable}
              disabled={working || !subscribed}
              className="flex-1 px-4 py-3 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-100 disabled:opacity-60"
            >
              {working ? 'Processando...' : 'Desativar'}
            </button>
          </div>

          <div className="mt-8 text-sm text-gray-500 space-y-2">
            <p>Se estiver usando outro navegador ou dispositivo, repita o processo neste dispositivo.</p>
            <p>Ao ativar, voce concorda em receber lembretes relacionados apenas as suas consultas agendadas.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
