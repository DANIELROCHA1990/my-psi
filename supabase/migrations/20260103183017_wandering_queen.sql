/*
  # Setup completo do MyPsi - Sistema de Gerenciamento de Pacientes

  1. Tabelas Principais
    - `profiles` - Perfis dos profissionais
    - `patients` - Pacientes
    - `sessions` - Sessões de terapia
    - `financial_records` - Registros financeiros
    - `receipts` - Recibos
    - `notifications` - Notificações

  2. Segurança
    - RLS habilitado em todas as tabelas
    - Políticas para isolamento por usuário autenticado
    - Triggers para definir user_id automaticamente

  3. Funcionalidades
    - Integração automática entre sessões e financeiro
    - Triggers para criação automática de registros financeiros
    - Índices para performance
*/

-- =====================================================
-- 1. TABELA DE PERFIS
-- =====================================================

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  specialty text,
  crp_number text,
  phone text,
  email text,
  address text,
  city text,
  state text,
  zip_code text,
  session_price numeric(10,2),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own profile"
  ON profiles FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- =====================================================
-- 2. TABELA DE PACIENTES
-- =====================================================

CREATE TABLE IF NOT EXISTS patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text,
  phone text,
  address text,
  birth_date date,
  cpf text,
  city text,
  state text,
  zip_code text,
  emergency_contact text,
  emergency_phone text,
  medical_history text,
  current_medications text,
  therapy_goals text,
  session_frequency text NOT NULL DEFAULT 'weekly',
  session_price numeric(10,2),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own patients"
  ON patients FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own patients"
  ON patients FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own patients"
  ON patients FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own patients"
  ON patients FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- =====================================================
-- 3. TABELA DE SESSÕES
-- =====================================================

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  session_date timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 50,
  session_type text NOT NULL DEFAULT 'Sessão Individual',
  session_notes text,
  mood_before text,
  mood_after text,
  homework_assigned text,
  next_session_date timestamptz,
  session_price numeric(10,2),
  payment_status text NOT NULL DEFAULT 'pending',
  summary text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own sessions"
  ON sessions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions"
  ON sessions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
  ON sessions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions"
  ON sessions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- =====================================================
-- 4. TABELA DE REGISTROS FINANCEIROS
-- =====================================================

CREATE TABLE IF NOT EXISTS financial_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
  session_id uuid REFERENCES sessions(id) ON DELETE SET NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN ('income', 'expense')),
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  description text,
  payment_method text NOT NULL DEFAULT 'cash',
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  category text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE financial_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own financial records"
  ON financial_records FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own financial records"
  ON financial_records FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own financial records"
  ON financial_records FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own financial records"
  ON financial_records FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- =====================================================
-- 5. TABELA DE RECIBOS
-- =====================================================

CREATE TABLE IF NOT EXISTS receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  receipt_number text UNIQUE NOT NULL,
  amount numeric(10,2) NOT NULL,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'generated',
  receipt_type text NOT NULL DEFAULT 'session',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own receipts"
  ON receipts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own receipts"
  ON receipts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own receipts"
  ON receipts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own receipts"
  ON receipts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- =====================================================
-- 6. TABELA DE NOTIFICAÇÕES
-- =====================================================

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  sent_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications"
  ON notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notifications"
  ON notifications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- =====================================================
-- 7. FUNÇÕES E TRIGGERS
-- =====================================================

-- Função para definir user_id automaticamente
CREATE OR REPLACE FUNCTION set_user_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.user_id = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers para definir user_id automaticamente
CREATE TRIGGER trigger_set_user_id_patients
  BEFORE INSERT ON patients
  FOR EACH ROW EXECUTE FUNCTION set_user_id();

CREATE TRIGGER trigger_set_user_id_sessions
  BEFORE INSERT ON sessions
  FOR EACH ROW EXECUTE FUNCTION set_user_id();

CREATE TRIGGER trigger_set_user_id_financial_records
  BEFORE INSERT ON financial_records
  FOR EACH ROW EXECUTE FUNCTION set_user_id();

CREATE TRIGGER trigger_set_user_id_receipts
  BEFORE INSERT ON receipts
  FOR EACH ROW EXECUTE FUNCTION set_user_id();

CREATE TRIGGER trigger_set_user_id_notifications
  BEFORE INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION set_user_id();

-- Triggers para atualizar updated_at
CREATE TRIGGER trigger_update_patients_updated_at
  BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_update_sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- 8. INTEGRAÇÃO AUTOMÁTICA SESSÕES-FINANCEIRO
-- =====================================================

-- Função para criar registro financeiro automaticamente quando sessão for paga
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
        'cash',
        'session',
        NEW.user_id
      );
    END IF;
  END IF;
  
  -- Se a sessão foi desmarcada como paga, remover registro financeiro
  IF OLD IS NOT NULL AND OLD.payment_status = 'paid' AND NEW.payment_status != 'paid' THEN
    DELETE FROM financial_records 
    WHERE session_id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers para integração automática
CREATE TRIGGER trigger_create_financial_record_on_insert
  AFTER INSERT ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION create_financial_record_for_session();

CREATE TRIGGER trigger_create_financial_record_on_update
  AFTER UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION create_financial_record_for_session();

-- =====================================================
-- 9. ÍNDICES PARA PERFORMANCE
-- =====================================================

-- Índices para patients
CREATE INDEX IF NOT EXISTS idx_patients_user_id ON patients(user_id);
CREATE INDEX IF NOT EXISTS idx_patients_active ON patients(active);
CREATE INDEX IF NOT EXISTS idx_patients_created_at ON patients(created_at);

-- Índices para sessions
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_patient_id ON sessions(patient_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_sessions_payment_status ON sessions(payment_status);

-- Índices para financial_records
CREATE INDEX IF NOT EXISTS idx_financial_records_user_id ON financial_records(user_id);
CREATE INDEX IF NOT EXISTS idx_financial_records_patient_id ON financial_records(patient_id);
CREATE INDEX IF NOT EXISTS idx_financial_records_session_id ON financial_records(session_id);
CREATE INDEX IF NOT EXISTS idx_financial_records_date ON financial_records(transaction_date);
CREATE INDEX IF NOT EXISTS idx_financial_records_type ON financial_records(transaction_type);

-- Índices para receipts
CREATE INDEX IF NOT EXISTS idx_receipts_user_id ON receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_receipts_patient_id ON receipts(patient_id);
CREATE INDEX IF NOT EXISTS idx_receipts_session_id ON receipts(session_id);
CREATE INDEX IF NOT EXISTS idx_receipts_status ON receipts(status);

-- Índices para notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_patient_id ON notifications(patient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_session_id ON notifications(session_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_scheduled_for ON notifications(scheduled_for);

-- =====================================================
-- 10. COMENTÁRIOS E DOCUMENTAÇÃO
-- =====================================================

COMMENT ON TABLE profiles IS 'Perfis dos profissionais de saúde mental';
COMMENT ON TABLE patients IS 'Pacientes cadastrados no sistema';
COMMENT ON TABLE sessions IS 'Sessões de terapia agendadas e realizadas';
COMMENT ON TABLE financial_records IS 'Registros financeiros (receitas e despesas)';
COMMENT ON TABLE receipts IS 'Recibos gerados para pacientes';
COMMENT ON TABLE notifications IS 'Sistema de notificações e lembretes';

COMMENT ON COLUMN patients.session_frequency IS 'Frequência das sessões: weekly, biweekly, monthly, as_needed';
COMMENT ON COLUMN sessions.payment_status IS 'Status do pagamento: pending, paid, cancelled';
COMMENT ON COLUMN financial_records.transaction_type IS 'Tipo de transação: income, expense';
COMMENT ON COLUMN receipts.status IS 'Status do recibo: generated, sent, cancelled';
COMMENT ON COLUMN notifications.status IS 'Status da notificação: pending, sent, failed';