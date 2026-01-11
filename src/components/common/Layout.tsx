import React, { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { authService } from '../../services/authService'
import {
  Brain,
  LayoutDashboard,
  UserRound,
  CalendarClock,
  CalendarCheck2,
  Wallet,
  SlidersHorizontal,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Moon,
  Sun
} from 'lucide-react'
import toast from 'react-hot-toast'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return true
    const stored = localStorage.getItem('sidebar-collapsed')
    return stored ? stored === 'true' : true
  })
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === 'undefined') return false
    const storedTheme = localStorage.getItem('theme')
    if (storedTheme) {
      return storedTheme === 'dark'
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? false
  })

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.classList.toggle('dark', darkMode)
    localStorage.setItem('theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem('sidebar-collapsed', sidebarCollapsed ? 'true' : 'false')
  }, [sidebarCollapsed])

  const handleSignOut = async () => {
    try {
      const { error } = await authService.signOut()
      if (error) throw error
      navigate('/auth')
      toast.success('Logout realizado com sucesso')
    } catch (error: any) {
      toast.error('Erro ao fazer logout')
    }
  }

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Pacientes', href: '/patients', icon: UserRound },
    { name: 'Sessoes', href: '/sessions', icon: CalendarCheck2 },
    { name: 'Agenda', href: '/calendar', icon: CalendarClock },
    { name: 'Financeiro', href: '/financial', icon: Wallet },
    { name: 'Configuracoes', href: '/settings', icon: SlidersHorizontal }
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar */}
      <div className={`fixed inset-0 flex z-40 md:hidden ${sidebarOpen ? '' : 'pointer-events-none'}`}>
        <div
          className={`fixed inset-0 bg-gray-600 bg-opacity-75 transition-opacity ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setSidebarOpen(false)}
        />

        <div
          className={`relative flex-1 flex flex-col max-w-xs w-full bg-white transform transition-transform ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="absolute top-0 right-0 -mr-12 pt-2">
            <button
              type="button"
              className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-6 w-6 text-white" />
            </button>
          </div>

          <div className="flex-1 h-0 pt-5 pb-4 overflow-y-auto">
            <div className="flex-shrink-0 flex items-center px-4">
              <div className="flex items-center">
                <div className="bg-emerald-600 p-2 rounded-lg">
                  <Brain className="h-8 w-8 text-white" />
                </div>
                <span className="ml-3 text-xl font-bold text-gray-900">MyPsi</span>
              </div>
            </div>
            <nav className="mt-5 px-2 space-y-1">
              {navigation.map((item) => {
                const isActive = location.pathname === item.href
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`group flex items-center px-2 py-2 text-base font-medium rounded-md transition-colors ${
                      isActive
                        ? 'bg-emerald-100 text-emerald-900'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <item.icon
                      className={`mr-4 h-6 w-6 ${
                        isActive ? 'text-emerald-500' : 'text-gray-400 group-hover:text-gray-500'
                      }`}
                    />
                    {item.name}
                  </Link>
                )
              })}
            </nav>
          </div>

          <div className="flex-shrink-0 flex border-t border-gray-200 p-4">
            <div className="flex items-center">
              <div className="bg-gray-200 rounded-full h-10 w-10 flex items-center justify-center">
                <span className="text-sm font-medium text-gray-700">
                  {user?.email?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-700 truncate">{user?.email}</p>
                <button
                  onClick={handleSignOut}
                  className="text-xs text-gray-500 hover:text-gray-700 flex items-center"
                >
                  <LogOut className="h-3 w-3 mr-1" />
                  Sair
                </button>
                <button
                  type="button"
                  onClick={() => setDarkMode((prev) => !prev)}
                  className="mt-2 text-xs text-gray-500 hover:text-gray-700 flex items-center"
                >
                  {darkMode ? <Sun className="h-3 w-3 mr-1" /> : <Moon className="h-3 w-3 mr-1" />}
                  {darkMode ? 'Tema claro' : 'Tema escuro'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Static sidebar for desktop */}
      <div className={`hidden md:flex ${sidebarCollapsed ? 'md:w-20' : 'md:w-64'} md:flex-col md:fixed md:inset-y-0`}>
        <div className="flex-1 flex flex-col min-h-0 border-r border-gray-200 bg-white">
          <div className="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
            {sidebarCollapsed ? (
              <div className="flex flex-col items-center gap-3 px-3">
                <div className="bg-emerald-600 p-2 rounded-lg">
                  <Brain className="h-8 w-8 text-white" />
                </div>
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:text-emerald-600 hover:bg-gray-100 transition-colors"
                  title="Expandir sidebar"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between flex-shrink-0 px-4">
                <div className="flex items-center">
                  <div className="bg-emerald-600 p-2 rounded-lg">
                    <Brain className="h-8 w-8 text-white" />
                  </div>
                  <span className="ml-3 text-xl font-bold text-gray-900">MyPsi</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed(true)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:text-emerald-600 hover:bg-gray-100 transition-colors"
                  title="Recolher sidebar"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              </div>
            )}
            <nav className="mt-5 flex-1 px-2 space-y-1">
              {navigation.map((item) => {
                const isActive = location.pathname === item.href
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    title={sidebarCollapsed ? item.name : undefined}
                    className={`group flex items-center ${sidebarCollapsed ? 'justify-center' : ''} px-2 py-2 text-sm font-medium rounded-md transition-colors ${
                      isActive
                        ? 'bg-emerald-100 text-emerald-900'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <item.icon
                      className={`${sidebarCollapsed ? 'h-6 w-6' : 'mr-3 h-5 w-5'} ${
                        isActive ? 'text-emerald-500' : 'text-gray-400 group-hover:text-gray-500'
                      }`}
                    />
                    <span className={sidebarCollapsed ? 'sr-only' : ''}>{item.name}</span>
                  </Link>
                )
              })}
            </nav>
          </div>

          <div className="flex-shrink-0 flex flex-col border-t border-gray-200 p-4 gap-3">
            <div className={`flex items-center ${sidebarCollapsed ? 'flex-col gap-3' : 'w-full'}`}>
              <div className="bg-gray-200 rounded-full h-10 w-10 flex items-center justify-center">
                <span className="text-sm font-medium text-gray-700">
                  {user?.email?.charAt(0).toUpperCase()}
                </span>
              </div>
              {sidebarCollapsed ? (
                <button
                  onClick={handleSignOut}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:text-emerald-600 hover:bg-gray-100 transition-colors"
                  title="Sair"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              ) : (
                <div className="ml-3 flex-1">
                  <p className="text-sm font-medium text-gray-700 truncate">{user?.email}</p>
                  <button
                    onClick={handleSignOut}
                    className="text-xs text-gray-500 hover:text-gray-700 flex items-center"
                  >
                    <LogOut className="h-3 w-3 mr-1" />
                    Sair
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setDarkMode((prev) => !prev)}
              className={`flex items-center text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors ${
                sidebarCollapsed ? 'justify-center' : ''
              }`}
              title={sidebarCollapsed ? (darkMode ? 'Tema claro' : 'Tema escuro') : undefined}
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {!sidebarCollapsed && <span className="ml-2">{darkMode ? 'Tema claro' : 'Tema escuro'}</span>}
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className={`${sidebarCollapsed ? 'md:pl-20' : 'md:pl-64'} flex flex-col flex-1`}>
        <div className="sticky top-0 z-10 md:hidden pl-1 pt-1 sm:pl-3 sm:pt-3 bg-gray-50">
          <button
            type="button"
            className="-ml-0.5 -mt-0.5 h-12 w-12 inline-flex items-center justify-center rounded-md text-gray-500 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>

        <main className="flex-1">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">{children}</div>
          </div>
        </main>
      </div>
    </div>
  )
}

