import React from 'react'

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-50">
      <header className="max-w-6xl mx-auto px-6 py-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">MyPsi</h1>
          <p className="text-sm text-gray-600">Sistema de gerenciamento de pacientes</p>
        </div>
        <a
          href="/auth"
          className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
        >
          Entrar
        </a>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div>
            <h2 className="text-4xl font-bold text-gray-900 leading-tight">
              Atendimento organizado, sessões sob controle e pacientes bem acompanhados.
            </h2>
            <p className="mt-4 text-gray-600 text-lg">
              O MyPsi ajuda profissionais de saúde a gerenciar pacientes, sessões, agenda e
              dados clínicos com segurança e praticidade.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <a
                href="/auth"
                className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-5 py-3 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
              >
                Acessar o sistema
              </a>
              <a
                href="/privacidade"
                className="inline-flex items-center justify-center rounded-lg border border-emerald-200 px-5 py-3 text-sm font-medium text-emerald-700 hover:bg-emerald-50 transition-colors"
              >
                Política de Privacidade
              </a>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-emerald-100 p-6">
            <h3 className="text-lg font-semibold text-gray-900">Recursos principais</h3>
            <ul className="mt-4 space-y-3 text-gray-600">
              <li>• Cadastro completo de pacientes e histórico clínico.</li>
              <li>• Agenda com visualização de sessões e pagamentos.</li>
              <li>• Links de atendimento e notificações automáticas.</li>
              <li>• Controle financeiro integrado.</li>
            </ul>
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between text-sm text-gray-500">
          <span>© 2026 MyPsi</span>
          <div className="flex gap-4">
            <a href="/privacidade" className="hover:text-emerald-700">Privacidade</a>
            <a href="/termos" className="hover:text-emerald-700">Termos</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
