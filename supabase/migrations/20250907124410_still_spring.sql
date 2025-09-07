/*
  # Atualização para integração automática entre sessões e financeiro

  1. Modificações
    - Adicionar trigger para criar registro financeiro automaticamente quando sessão for paga
    - Atualizar estrutura para suportar múltiplas sessões por paciente
    
  2. Triggers
    - Trigger para criar transação financeira quando sessão for marcada como paga
    - Trigger para atualizar transação financeira quando status da sessão mudar
*/

-- Função para criar registro financeiro automaticamente
CREATE OR REPLACE FUNCTION create_financial_record_for_session()
RETURNS TRIGGER AS $$
BEGIN
  -- Se a sessão foi marcada como paga, criar registro financeiro
  IF NEW.payment_status = 'paid' AND NEW.session_price IS NOT NULL THEN
    -- Verificar se já existe um registro financeiro para esta sessão
    IF NOT EXISTS (
      SELECT 1 FROM financial_records 
      WHERE session_id = NEW.id
    ) THEN
      INSERT INTO financial_records (
        patient_id,
        session_id,
        amount,
        transaction_date,
        description,
        transaction_type,
        payment_method,
        category,
        user_id
      ) VALUES (
        NEW.patient_id,
        NEW.id,
        NEW.session_price,
        NEW.session_date::date,
        'Pagamento de sessão - ' || (SELECT full_name FROM patients WHERE id = NEW.patient_id),
        'income',
        'cash', -- valor padrão, pode ser alterado depois
        'session',
        NEW.user_id
      );
    END IF;
  END IF;
  
  -- Se a sessão foi desmarcada como paga, remover registro financeiro
  IF OLD.payment_status = 'paid' AND NEW.payment_status != 'paid' THEN
    DELETE FROM financial_records 
    WHERE session_id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para sessões novas
CREATE OR REPLACE TRIGGER trigger_create_financial_record_on_insert
  AFTER INSERT ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION create_financial_record_for_session();

-- Trigger para atualizações de sessões
CREATE OR REPLACE TRIGGER trigger_create_financial_record_on_update
  AFTER UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION create_financial_record_for_session();