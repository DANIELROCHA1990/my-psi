export type PsiformTopicFieldMeta = {
  id: string
  label: string
  type: string
}

export type PsiformTopicMeta = {
  id: string
  sectionId: string
  sectionTitle: string
  title: string
  legend: string
  entryType: string
  fields: PsiformTopicFieldMeta[]
}

export const PSIFORM_TOPICS_META: PsiformTopicMeta[] = [
  {
    "id": "identification-core",
    "sectionId": "identification",
    "sectionTitle": "Dados do Usuário/Cliente",
    "title": "Dados do Usuário/Cliente",
    "legend": "Nome, Data de Nascimento, Sexo, Estado Cívil, Profissão, Endereço, Telefone, Celular, E-mail.",
    "entryType": "note",
    "fields": [
      {
        "id": "full_name",
        "label": "Nome",
        "type": "text"
      },
      {
        "id": "birth_date",
        "label": "Data de Nascimento",
        "type": "date"
      },
      {
        "id": "sex",
        "label": "Sexo",
        "type": "text"
      },
      {
        "id": "marital_status",
        "label": "Estado Cívil",
        "type": "text"
      },
      {
        "id": "profession",
        "label": "Profissão",
        "type": "text"
      },
      {
        "id": "address",
        "label": "Endereço",
        "type": "text"
      },
      {
        "id": "phone",
        "label": "Telefone",
        "type": "phone"
      },
      {
        "id": "email",
        "label": "E-mail",
        "type": "email"
      }
    ]
  },
  {
    "id": "history-consult-reason",
    "sectionId": "history",
    "sectionTitle": "Histórico e Avaliação",
    "title": "Motivo da Consulta",
    "legend": "Descrição detalhada da razão pela qual o usuário/cliente procurou os serviços psicológicos. O que o motivou a buscar ajuda? Quais são as principais queixas ou preocupações?",
    "entryType": "anamnesis",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "history-problem-history",
    "sectionId": "history",
    "sectionTitle": "Histórico e Avaliação",
    "title": "Histórico do Problema",
    "legend": "Contextualização do problema, incluindo quando ele teve início, como tem se desenvolvido ao longo do tempo e quais eventos ou situações podem estar associados ao seu surgimento. O psicólogo(a) deve explorar a história pessoal, social e emocional do usuário/cliente.",
    "entryType": "anamnesis",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "history-life-trajectory",
    "sectionId": "history",
    "sectionTitle": "Histórico e Avaliação",
    "title": "Trajetória de Vida",
    "legend": "Exploração da história de vida do usuário/cliente, incluindo informações sobre sua infância, família, relações interpessoais, eventos significativos e mudanças de vida relevantes. Isso pode fornecer insights sobre possíveis influências no desenvolvimento do problema.",
    "entryType": "anamnesis",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "history-previous-treatment",
    "sectionId": "history",
    "sectionTitle": "Histórico e Avaliação",
    "title": "Experiências Anteriores de Tratamento",
    "legend": "Se o usuário/cliente já recebeu tratamento psicológico anteriormente, é importante obter informações sobre os tipos de intervenções realizadas, resultados alcançados e razões para interrupção, se for o caso.",
    "entryType": "anamnesis",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "history-support-network",
    "sectionId": "history",
    "sectionTitle": "Histórico e Avaliação",
    "title": "Rede de Apoio Social",
    "legend": "Identificação das pessoas ou grupos que compõem a rede de apoio do usuário/cliente, como familiares, amigos, colegas de trabalho, entre outros. Isso ajuda a entender a influência das relações sociais no problema apresentado.",
    "entryType": "anamnesis",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "history-initial-assessment",
    "sectionId": "history",
    "sectionTitle": "Histórico e Avaliação",
    "title": "Avaliação Inicial",
    "legend": "Descrição das avaliações realizadas durante a primeira consulta ou ao longo das sessões iniciais. Isso pode incluir questionários, entrevistas, testes psicológicos ou outras ferramentas de avaliação utilizadas para compreender melhor o funcionamento emocional, cognitivo e comportamental do usuário/cliente.",
    "entryType": "anamnesis",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "history-expectations-goals",
    "sectionId": "history",
    "sectionTitle": "Histórico e Avaliação",
    "title": "Expectativas e Objetivos",
    "legend": "Exploração das expectativas do usuário/cliente em relação ao tratamento psicológico e dos objetivos que ele deseja alcançar. O que ele espera conquistar com a terapia? Quais são suas metas?",
    "entryType": "anamnesis",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "history-current-conditions",
    "sectionId": "history",
    "sectionTitle": "Histórico e Avaliação",
    "title": "Condições Atuais",
    "legend": "Informações sobre o estado emocional, sintomas atuais e impacto do problema na vida diária do usuário/cliente. Isso ajuda a contextualizar o momento presente e a estabelecer referências para avaliações futuras.",
    "entryType": "anamnesis",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "history-cultural-context",
    "sectionId": "history",
    "sectionTitle": "Histórico e Avaliação",
    "title": "Considerações Culturais e Contextuais",
    "legend": "Consideração de fatores culturais, étnicos, religiosos e contextuais que possam estar relacionados ao problema do usuário/cliente. Isso ajuda a compreender sua experiência de forma mais ampla e sensível.",
    "entryType": "anamnesis",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "history-notes",
    "sectionId": "history",
    "sectionTitle": "Histórico e Avaliação",
    "title": "Observações Adicionais (Histórico)",
    "legend": "Espaço para quaisquer outras informações relevantes que o(a) psicólogo(a) considere importante registrar, como observações sobre a interação com o usuário/cliente, impressões iniciais, entre outros.",
    "entryType": "anamnesis",
    "fields": [
      {
        "id": "content",
        "label": "Observações",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "plan-therapeutic-approach",
    "sectionId": "intervention",
    "sectionTitle": "Plano de Intervenção",
    "title": "Abordagem Terapêutica",
    "legend": "Descrição da abordagem terapêutica que será adotada durante o tratamento. Isso inclui explicar a orientação teórica que guiará o trabalho terapêutico, como psicodinâmica, cognitivo-comportamental, humanista, entre outras.",
    "entryType": "intervention",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "plan-goals",
    "sectionId": "intervention",
    "sectionTitle": "Plano de Intervenção",
    "title": "Objetivos Terapêuticos",
    "legend": "Definição clara dos objetivos terapêuticos que serão perseguidos ao longo do tratamento. Cada objetivo deve ser específico, mensurável, alcançável, relevante e temporizável (critérios SMART).",
    "entryType": "intervention",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "plan-techniques",
    "sectionId": "intervention",
    "sectionTitle": "Plano de Intervenção",
    "title": "Técnicas e Estratégias",
    "legend": "Enumeração das técnicas terapêuticas específicas que serão empregadas para atingir os objetivos terapêuticos. Isso pode incluir técnicas de relaxamento, reestruturação cognitiva, resolução de problemas, exposição gradual, entre outras.",
    "entryType": "intervention",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "plan-session-frequency",
    "sectionId": "intervention",
    "sectionTitle": "Plano de Intervenção",
    "title": "Frequência e Duração das Sessões",
    "legend": "Especificação da frequência das sessões terapêuticas (por exemplo, semanais ou quinzenais) e da duração estimada de cada sessão (por exemplo, 50 minutos).",
    "entryType": "intervention",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "plan-collaborative-actions",
    "sectionId": "intervention",
    "sectionTitle": "Plano de Intervenção",
    "title": "Intervenções Colaborativas",
    "legend": "Indicação de como o usuário/cliente será envolvido no processo terapêutico, incluindo o compartilhamento de responsabilidades, práticas fora das sessões (como tarefas de casa) e outras formas de colaboração.",
    "entryType": "intervention",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "plan-monitoring",
    "sectionId": "intervention",
    "sectionTitle": "Plano de Intervenção",
    "title": "Acompanhamento e Avaliação",
    "legend": "Descrição de como o progresso do usuário/cliente será monitorado e avaliado ao longo do tratamento. Isso pode incluir a utilização de escalas de avaliação, reavaliações periódicas e ajustes no plano de intervenção conforme necessário.",
    "entryType": "intervention",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "plan-challenges",
    "sectionId": "intervention",
    "sectionTitle": "Plano de Intervenção",
    "title": "Possíveis Desafios e Estratégias de Enfrentamento",
    "legend": "Identificação antecipada de possíveis desafios que podem surgir durante o tratamento e estratégias de enfrentamento que podem ser adotadas para superá-los.",
    "entryType": "intervention",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "plan-multidisciplinary",
    "sectionId": "intervention",
    "sectionTitle": "Plano de Intervenção",
    "title": "Colaboração Multidisciplinar",
    "legend": "Se houver a necessidade de colaboração com outros profissionais de saúde, educação ou áreas afins, detalhar como essa colaboração será estabelecida e quais informações serão compartilhadas.",
    "entryType": "intervention",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "plan-review-update",
    "sectionId": "intervention",
    "sectionTitle": "Plano de Intervenção",
    "title": "Revisão e Atualização",
    "legend": "Indicação de quando e como o plano de intervenção será revisado e atualizado, levando em consideração o progresso do usuário/cliente e eventuais mudanças nas necessidades terapêuticas.",
    "entryType": "intervention",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "plan-notes",
    "sectionId": "intervention",
    "sectionTitle": "Plano de Intervenção",
    "title": "Observações Adicionais (Plano)",
    "legend": "Espaço para quaisquer outras informações relevantes relacionadas ao plano de intervenção ou ao processo terapêutico em geral.",
    "entryType": "intervention",
    "fields": [
      {
        "id": "content",
        "label": "Observações",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "evolution-session-atmosphere",
    "sectionId": "evolution",
    "sectionTitle": "Evolução das Sessões",
    "title": "Sessão [Número da Sessão] - Data",
    "legend": "Descrição geral da atmosfera e do ambiente durante a sessão, bem como a data e a duração da sessão.",
    "entryType": "evolution",
    "fields": [
      {
        "id": "session_number",
        "label": "Número da Sessão",
        "type": "text"
      },
      {
        "id": "session_date",
        "label": "Data da Sessão",
        "type": "date"
      },
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "evolution-discussed-topics",
    "sectionId": "evolution",
    "sectionTitle": "Evolução das Sessões",
    "title": "Temas Abordados",
    "legend": "Resumo dos temas, tópicos ou questões discutidas durante a sessão. Isso pode incluir emoções, pensamentos, eventos significativos e preocupações do usuário/cliente.",
    "entryType": "evolution",
    "fields": [
      {
        "id": "content",
        "label": "Resumo",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "evolution-activities",
    "sectionId": "evolution",
    "sectionTitle": "Evolução das Sessões",
    "title": "Atividades Realizadas",
    "legend": "Detalhamento das atividades terapêuticas realizadas durante a sessão, como exercícios, reflexões, técnicas específicas e intervenções práticas.",
    "entryType": "evolution",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "evolution-progress",
    "sectionId": "evolution",
    "sectionTitle": "Evolução das Sessões",
    "title": "Progressos Observados",
    "legend": "Registro de quaisquer progressos, insights ou mudanças observadas no usuário/paciente ao longo da sessão ou desde a última sessão. Isso pode incluir melhorias em sintomas, aquisição de habilidades de enfrentamento ou aumento da autoconsciência.",
    "entryType": "evolution",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "evolution-obstacles",
    "sectionId": "evolution",
    "sectionTitle": "Evolução das Sessões",
    "title": "Desafios e Obstáculos",
    "legend": "Identificação de desafios ou obstáculos enfrentados pelo usuário/paciente durante a sessão, bem como possíveis dificuldades na implementação do plano de intervenção.",
    "entryType": "evolution",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "evolution-patient-feedback",
    "sectionId": "evolution",
    "sectionTitle": "Evolução das Sessões",
    "title": "Feedback do Usuário/Paciente (Sessões)",
    "legend": "Registro de qualquer feedback fornecido pelo usuário/cliente em relação ao tratamento, às atividades realizadas ou ao processo terapêutico como um todo.",
    "entryType": "evolution",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "evolution-therapist-evaluation",
    "sectionId": "evolution",
    "sectionTitle": "Evolução das Sessões",
    "title": "Avaliação do Terapeuta",
    "legend": "Impressões e observações do(a) psicólogo(a) sobre o andamento da sessão, a participação do usuário/paciente e quaisquer insights ou reflexões terapêuticas.",
    "entryType": "evolution",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "evolution-plan-adjustments",
    "sectionId": "evolution",
    "sectionTitle": "Evolução das Sessões",
    "title": "Ajustes no Plano de Intervenção",
    "legend": "Indicação de quaisquer ajustes realizados no plano de intervenção com base nos progressos, desafios ou mudanças observadas durante a sessão.",
    "entryType": "evolution",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "evolution-next-session-planning",
    "sectionId": "evolution",
    "sectionTitle": "Evolução das Sessões",
    "title": "Planejamento para a Próxima Sessão",
    "legend": "Previsão de temas a serem abordados na próxima sessão, tarefas de casa sugeridas, atividades planejadas ou objetivos a serem perseguidos.",
    "entryType": "evolution",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "evolution-notes",
    "sectionId": "evolution",
    "sectionTitle": "Evolução das Sessões",
    "title": "Observações Adicionais (Evolução)",
    "legend": "Espaço para quaisquer outras observações, considerações ou anotações relevantes sobre a evolução do usuário/cliente ao longo das sessões.",
    "entryType": "evolution",
    "fields": [
      {
        "id": "content",
        "label": "Observações",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "closure-referral-made",
    "sectionId": "closure",
    "sectionTitle": "Encaminhamentos e Encerramento",
    "title": "Encaminhamento Realizado",
    "legend": "Descrição detalhada do encaminhamento feito para outro profissional ou serviço de saúde, se aplicável. Isso pode incluir o motivo do encaminhamento, o nome do profissional ou instituição encaminhada e quaisquer instruções fornecidas.",
    "entryType": "referral",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "closure-referral-reason",
    "sectionId": "closure",
    "sectionTitle": "Encaminhamentos e Encerramento",
    "title": "Motivo do Encaminhamento",
    "legend": "Explicação clara do motivo pelo qual o encaminhamento foi considerado necessário, destacando as áreas de especialização ou recursos adicionais que o profissional ou serviço encaminhado pode oferecer.",
    "entryType": "referral",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "closure-discussion-with-patient",
    "sectionId": "closure",
    "sectionTitle": "Encaminhamentos e Encerramento",
    "title": "Discussão com o Usuário/Cliente",
    "legend": "Registro das conversas realizadas com o usuário/cliente sobre o encaminhamento proposto, incluindo suas opiniões, dúvidas, expectativas e nível de concordância.",
    "entryType": "referral",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "closure-care-continuity",
    "sectionId": "closure",
    "sectionTitle": "Encaminhamentos e Encerramento",
    "title": "Planejamento de Continuidade de Cuidados",
    "legend": "Detalhamento das medidas tomadas para garantir a continuidade dos cuidados após o encaminhamento, como o compartilhamento de informações, agendamentos futuros ou orientações específicas.",
    "entryType": "referral",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "closure-treatment-closure",
    "sectionId": "closure",
    "sectionTitle": "Encaminhamentos e Encerramento",
    "title": "Encerramento do Tratamento",
    "legend": "Descrição dos processos e considerações relacionados ao encerramento do tratamento, incluindo a decisão de encerrar, o motivo, a discussão com o usuário/cliente e os passos tomados para finalizar o processo terapêutico.",
    "entryType": "note",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "closure-progress-evaluation",
    "sectionId": "closure",
    "sectionTitle": "Encaminhamentos e Encerramento",
    "title": "Avaliação do Progresso",
    "legend": "Reflexões sobre o progresso do usuário/cliente ao longo do tratamento, incluindo as metas alcançadas, os desafios superados e as mudanças observadas desde o início do atendimento.",
    "entryType": "note",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "closure-final-feedback",
    "sectionId": "closure",
    "sectionTitle": "Encaminhamentos e Encerramento",
    "title": "Feedback do Usuário/Paciente (Encerramento)",
    "legend": "Registro do feedback fornecido pelo usuário/cliente em relação ao processo terapêutico, à relação terapêutica, aos resultados alcançados e às experiências vivenciadas.",
    "entryType": "note",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "closure-closing-preparation",
    "sectionId": "closure",
    "sectionTitle": "Encaminhamentos e Encerramento",
    "title": "Preparação para o Encerramento",
    "legend": "Detalhes sobre como o usuário/cliente foi preparado para o encerramento, incluindo discussões sobre a manutenção dos progressos, estratégias de enfrentamento e recursos disponíveis.",
    "entryType": "note",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "closure-final-documents",
    "sectionId": "closure",
    "sectionTitle": "Encaminhamentos e Encerramento",
    "title": "Documentos e Informações Finais",
    "legend": "Indicação dos documentos finais compartilhados com o usuário/cliente no encerramento, como relatórios, resumos de progresso ou orientações futuras.",
    "entryType": "document",
    "fields": [
      {
        "id": "content",
        "label": "Descrição",
        "type": "textarea"
      }
    ]
  },
  {
    "id": "closure-notes",
    "sectionId": "closure",
    "sectionTitle": "Encaminhamentos e Encerramento",
    "title": "Observações Adicionais (Encerramento)",
    "legend": "Espaço para quaisquer outras observações ou anotações relevantes sobre o encaminhamento e o encerramento do tratamento.",
    "entryType": "note",
    "fields": [
      {
        "id": "content",
        "label": "Observações",
        "type": "textarea"
      }
    ]
  }
]
