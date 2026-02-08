import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  disablePushToken,
  disableUserPushToken,
  getPushSubscriptionStatus,
  getPushSupportStatus,
  getUserPushSubscriptionStatus,
  getPushErrorMessage,
  registerPushToken,
  registerUserPushToken
} from '../lib/pushSubscription'
import { isFirebaseConfigured } from '../lib/firebase'
import { useAuth } from '../hooks/useAuth'

const PERMISSION_LABELS: Record<NotificationPermission, string> = {
  default: 'Não definido',
  denied: 'Negado',
  granted: 'Concedido'
}

export default function Notifications() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const consentToken = useMemo(() => {
    return searchParams.get('consent') || searchParams.get('token') || ''
  }, [searchParams])

  const isUserMode = !consentToken && Boolean(user)

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
      if (supported === false) {
        setStatusMessage(supportReason || 'Notificações não suportadas neste dispositivo.')
        return
      }

      if (supported === null) {
        return
      }

      setChecking(true)
      try {
        if (consentToken) {
          const status = await getPushSubscriptionStatus(consentToken)
          if (!active) return
          setSubscribed(status.isEnabled)
          setLastSeenAt(status.lastSeenAt)
          setStatusMessage(status.isEnabled ? 'Lembretes ativados.' : 'Lembretes ainda não ativados.')
          return
        }

        if (user) {
          const status = await getUserPushSubscriptionStatus()
          if (!active) return
          setSubscribed(status.isEnabled)
          setLastSeenAt(status.lastSeenAt)
          setStatusMessage(status.isEnabled ? 'Notificações ativadas.' : 'Notificações ainda não ativadas.')
          return
        }

        setStatusMessage('Link de consentimento não encontrado.')
      } catch (error) {
        console.error('Erro ao verificar push:', error)
        if (!active) return
        setStatusMessage('Não foi possível verificar a assinatura agora.')
      } finally {
        if (active) setChecking(false)
      }
    }

    loadStatus()

    return () => {
      active = false
    }
  }, [consentToken, supported, supportReason, user])

  const handleEnable = async () => {
    if (!isFirebaseConfigured) {
      toast.error('Firebase não configurado neste portal.')
      return
    }

    setWorking(true)
    try {
      const result = await Notification.requestPermission()
      setPermission(result)

      if (result !== 'granted') {
        toast.error('Permissão de notificação negada.')
        setStatusMessage('Permissão negada. Ative nas configurações do navegador.')
        return
      }

      if (consentToken) {
        await registerPushToken(consentToken, { source: 'portal' })
        setSubscribed(true)
        setStatusMessage('Lembretes ativados com sucesso!')
        toast.success('Lembretes ativados')
        if (user) navigate('/')
        return
      }

      if (user) {
        await registerUserPushToken({ source: 'owner' })
        setSubscribed(true)
        setStatusMessage('Notificações ativadas com sucesso!')
        toast.success('Notificações ativadas')
        navigate('/')
        return
      }

      toast.error('Faça login para ativar as notificações.')
    } catch (error) {
      console.error('Erro ao ativar push:', error)
      const message = getPushErrorMessage(error)
      setStatusMessage(message)
      toast.error(message)
    } finally {
      setWorking(false)
    }
  }

  const handleDisable = async () => {
    setWorking(true)
    try {
      if (consentToken) {
        await disablePushToken(consentToken)
        setSubscribed(false)
        setStatusMessage('Lembretes desativados.')
        toast.success('Lembretes desativados')
        if (user) navigate('/')
        return
      }

      if (user) {
        await disableUserPushToken()
        setSubscribed(false)
        setStatusMessage('Notificações desativadas.')
        toast.success('Notificações desativadas')
        navigate('/')
        return
      }

      toast.error('Faça login para desativar as notificações.')
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
        Para ativar, abra as configurações do navegador, permita notificações para este site e recarregue a página.
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-gray-900">
              {isUserMode ? 'Notificações de agendamento' : 'Lembretes de consulta'}
            </h1>
            <p className="text-gray-600">
              {isUserMode
                ? 'Você vai receber um aviso quando um paciente preencher o link de agendamento.'
                : 'Você vai receber lembretes de consulta no navegador deste dispositivo. Você pode desativar quando quiser.'}
            </p>
          </div>

          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-700">
                Permissão: {PERMISSION_LABELS[permission]}
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
                  Última atualização: {new Date(lastSeenAt).toLocaleString('pt-BR')}
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
              {checking ? 'Verificando sua inscrição...' : statusMessage}
            </div>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={handleEnable}
              disabled={working || subscribed || supported === false}
              className="flex-1 px-4 py-3 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-60"
            >
              {working ? 'Ativando...' : subscribed ? (isUserMode ? 'Notificações ativadas' : 'Lembretes ativados') : (isUserMode ? 'Ativar notificações' : 'Ativar lembretes')}
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
            <p>{isUserMode
                ? 'Ao ativar, você concorda em receber notificações relacionadas a novos agendamentos.'
                : 'Ao ativar, você concorda em receber lembretes relacionados apenas às suas consultas agendadas.'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
