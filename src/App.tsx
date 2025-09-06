import React from 'react'
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
import Receipts from './pages/Receipts'
import Settings from './pages/Settings'

export default function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!user) {
    return (
      <>
        <AuthForm />
        <Toaster position="top-right" />
      </>
    )
  }

  return (
    <Router>
      <ProtectedRoute>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/patients" element={<Patients />} />
            <Route path="/sessions" element={<Sessions />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/financial" element={<Financial />} />
            <Route path="/receipts" element={<Receipts />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </ProtectedRoute>
      <Toaster position="top-right" />
    </Router>
  )
}