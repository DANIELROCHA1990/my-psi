import React from 'react'

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <header className="mb-8">
          <p className="text-sm text-gray-500">Última atualização: 8 de fevereiro de 2026</p>
          <h1 className="text-3xl font-bold text-gray-900 mt-2">Política de Privacidade</h1>
          <p className="text-gray-600 mt-2">
            Esta Política de Privacidade explica como o my-psi coleta, utiliza e protege dados
            pessoais quando você usa o aplicativo.
          </p>
        </header>

        <div className="space-y-6 text-gray-700">
          <section>
            <h2 className="text-lg font-semibold text-gray-900">1. Dados que coletamos</h2>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Dados de conta: nome, e-mail, senha e informações de autenticação.</li>
              <li>Dados profissionais: especialidade, CRP, valores e configurações do serviço.</li>
              <li>Dados de pacientes inseridos por você: nome, contato, histórico e sessões.</li>
              <li>Dados de uso: registros de atividade para suporte e melhorias do app.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">2. Como usamos os dados</h2>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Operar o aplicativo e fornecer as funcionalidades contratadas.</li>
              <li>Gerar agendas, relatórios e links de sessão.</li>
              <li>Enviar comunicações operacionais e notificações quando configuradas.</li>
              <li>Melhorar segurança, performance e experiência do usuário.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">3. Compartilhamento</h2>
            <p className="mt-2">
              Não vendemos seus dados. Podemos compartilhar informações com provedores de
              infraestrutura e serviços essenciais (ex: hospedagem, notificações e e-mail),
              sempre que necessário para operar o app, seguindo boas práticas de segurança.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">4. Armazenamento e segurança</h2>
            <p className="mt-2">
              Adotamos medidas técnicas e organizacionais para proteger dados contra acesso não
              autorizado, alteração ou perda. Nenhum sistema é 100% seguro, portanto não podemos
              garantir segurança absoluta.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">5. Seus direitos</h2>
            <p className="mt-2">
              Você pode solicitar acesso, correção ou exclusão de dados pessoais, bem como
              esclarecimentos sobre o tratamento. Entre em contato pelo e-mail informado abaixo.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">6. Dados sensíveis</h2>
            <p className="mt-2">
              O app pode armazenar dados sensíveis de pacientes, inseridos pelo profissional.
              O usuário é responsável por garantir base legal e consentimentos necessários para
              esse tratamento.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">7. Contato</h2>
            <p className="mt-2">
              Para dúvidas sobre esta Política, entre em contato: suportemypsi@gmail.com.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">8. Atualizações</h2>
            <p className="mt-2">
              Podemos atualizar esta Política periodicamente. A versão mais recente sempre
              estará disponível nesta página.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
