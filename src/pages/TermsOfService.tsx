import React from 'react'

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <header className="mb-8">
          <p className="text-sm text-gray-500">Última atualização: 8 de fevereiro de 2026</p>
          <h1 className="text-3xl font-bold text-gray-900 mt-2">Termos de Serviço</h1>
          <p className="text-gray-600 mt-2">
            Ao acessar e usar o my-psi, você concorda com estes Termos de Serviço.
          </p>
        </header>

        <div className="space-y-6 text-gray-700">
          <section>
            <h2 className="text-lg font-semibold text-gray-900">1. Uso do serviço</h2>
            <p className="mt-2">
              O my-psi é uma plataforma de gestão para profissionais de saúde. Você concorda
              em utilizar o serviço de forma lícita e conforme estes termos.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">2. Conta e segurança</h2>
            <p className="mt-2">
              Você é responsável por manter suas credenciais seguras e por todas as atividades
              realizadas em sua conta. Em caso de suspeita de uso indevido, comunique-nos.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">3. Conteúdo inserido</h2>
            <p className="mt-2">
              Os dados inseridos por você (incluindo dados de pacientes) são de sua
              responsabilidade. Você declara ter base legal e consentimentos necessários para
              o tratamento dessas informações.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">4. Disponibilidade</h2>
            <p className="mt-2">
              Empenhamos esforços para manter o serviço disponível, mas não garantimos operação
              ininterrupta. Podemos realizar manutenções e atualizações quando necessário.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">5. Limitação de responsabilidade</h2>
            <p className="mt-2">
              O my-psi é uma ferramenta de apoio à gestão. Não substitui o julgamento clínico
              do profissional. Não nos responsabilizamos por decisões tomadas com base nos
              dados inseridos na plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">6. Encerramento</h2>
            <p className="mt-2">
              Podemos suspender ou encerrar o acesso em caso de violação destes termos ou uso
              indevido do serviço.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">7. Contato</h2>
            <p className="mt-2">
              Para dúvidas sobre estes Termos, entre em contato: suportemypsi@gmail.com.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
