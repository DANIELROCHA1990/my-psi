import React, { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import toast from 'react-hot-toast'
import { useAuth } from './hooks/useAuth'
import AuthForm from './components/auth/AuthForm'
import Layout from './components/common/Layout'
import ProtectedRoute from './components/common/ProtectedRoute'
import Dashboard from './pages/Dashboard'
import Patients from './pages/Patients'
import Sessions from './pages/Sessions'
import Calendar from './pages/Calendar'
import Financial from './pages/Financial'
import Settings from './pages/Settings'
import Notifications from './pages/Notifications'
import PushAgendaPreview from './pages/PushAgendaPreview'
import ScheduleLink from './pages/ScheduleLink'
import { supabase } from './lib/supabase'
import { listenForForegroundMessages } from './lib/pushSubscription'
import { Eye, EyeOff, Lock } from 'lucide-react'

export default function App() {
  const { user, loading } = useAuth()
  const [forcePasswordChange, setForcePasswordChange] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [updatingPassword, setUpdatingPassword] = useState(false)
  const [passwordData, setPasswordData] = useState({
    newPassword: '',
    confirmPassword: ''
  })

  useEffect(() => {
    if (typeof document === 'undefined') return
    const storedTheme = localStorage.getItem('theme')
    if (storedTheme) {
      document.documentElement.classList.toggle('dark', storedTheme === 'dark')
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setForcePasswordChange(false)
      return
    }
    const metadata = (user.user_metadata || {}) as Record<string, any>
    const hasChanged = Boolean(metadata.password_changed_at)
    setForcePasswordChange(!hasChanged)
  }, [user])

  useEffect(() => {
    let unsubscribe = () => {}
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      listenForForegroundMessages((payload) => {
        const title = payload.data?.title || payload.notification?.title || 'Notificação'
        const body = payload.data?.body || payload.notification?.body || ''
        toast.success(`${title}${body ? ` - ${body}` : ''}`)
      }).then((unsub) => {
        unsubscribe = unsub
      })
    }

    return () => {
      unsubscribe()
    }
  }, [])

  const handleForcePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    const newPassword = passwordData.newPassword.trim()
    const confirmPassword = passwordData.confirmPassword.trim()

    if (!newPassword || newPassword.length < 8) {
      toast.error('A nova senha deve ter pelo menos 8 caracteres.')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('As senhas não conferem.')
      return
    }

    try {
      setUpdatingPassword(true)
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
        data: { password_changed_at: new Date().toISOString() }
      })
      if (error) throw error

      setForcePasswordChange(false)
      setPasswordData({ newPassword: '', confirmPassword: '' })
      toast.success('Senha atualizada com sucesso!')
    } catch (error: any) {
      toast.error(error.message || 'Erro ao atualizar senha')
    } finally {
      setUpdatingPassword(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    )
  }

  return (
    <Router>
      <Routes>
        <Route path="/notificacoes" element={<Notifications />} />
        <Route path="/push" element={<Navigate to="/notificacoes" replace />} />
        <Route path="/push/agenda" element={<PushAgendaPreview />} />
        <Route path="/link-de-agendamento" element={<ScheduleLink />} />
        <Route
          path="/auth"
          element={user ? <Navigate to="/" replace /> : <AuthForm />}
        />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/patients" element={<Patients />} />
                  <Route path="/sessions" element={<Sessions />} />
                  <Route path="/calendar" element={<Calendar />} />
                  <Route path="/financial" element={<Financial />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
      <Toaster position="top-right" />
      {forcePasswordChange && user && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full shadow-lg">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Alterar senha</h2>
              <p className="text-sm text-gray-600 mt-1">
                Por segurança, defina uma nova senha para continuar.
              </p>
            </div>
            <form onSubmit={handleForcePasswordSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nova senha
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                    className="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                    placeholder="Digite a nova senha"
                    required
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowPassword(prev => !prev)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                    ) : (
                      <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confirmar senha
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  className="block w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                  placeholder="Confirme a nova senha"
                  required
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={updatingPassword}
                  className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-60"
                >
                  {updatingPassword ? 'Atualizando...' : 'Atualizar senha'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Router>
  )
}

