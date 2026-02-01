import React, { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
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

export default function App() {
  const { user, loading } = useAuth()

  useEffect(() => {
    if (typeof document === 'undefined') return
    const storedTheme = localStorage.getItem('theme')
    if (storedTheme) {
      document.documentElement.classList.toggle('dark', storedTheme === 'dark')
    }
  }, [])

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
    </Router>
  )
}

