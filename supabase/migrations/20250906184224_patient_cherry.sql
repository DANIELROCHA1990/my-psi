/*
  # Corrigir tabela de registros financeiros

  1. Changes
    - Ensure proper table structure
    - Fix foreign key references
    - Add missing columns and constraints

  2. Security
    - Update RLS policies
    - Ensure proper user isolation
*/

-- Create financial_records table if it doesn't exist
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

-- Enable RLS
ALTER TABLE financial_records ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can read own financial records" ON financial_records;
DROP POLICY IF EXISTS "Users can insert own financial records" ON financial_records;
DROP POLICY IF EXISTS "Users can update own financial records" ON financial_records;
DROP POLICY IF EXISTS "Users can delete own financial records" ON financial_records;

-- Create RLS policies
CREATE POLICY "Users can read own financial records"
  ON financial_records
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own financial records"
  ON financial_records
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own financial records"
  ON financial_records
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own financial records"
  ON financial_records
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create trigger function for financial records
CREATE OR REPLACE FUNCTION set_financial_record_user_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.user_id = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_set_financial_record_user_id ON financial_records;

-- Create trigger
CREATE TRIGGER trigger_set_financial_record_user_id
  BEFORE INSERT ON financial_records
  FOR EACH ROW
  EXECUTE FUNCTION set_financial_record_user_id();

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_financial_records_user_id ON financial_records(user_id);
CREATE INDEX IF NOT EXISTS idx_financial_records_patient_id ON financial_records(patient_id);
CREATE INDEX IF NOT EXISTS idx_financial_records_session_id ON financial_records(session_id);
CREATE INDEX IF NOT EXISTS idx_financial_records_date ON financial_records(transaction_date);
CREATE INDEX IF NOT EXISTS idx_financial_records_type ON financial_records(transaction_type);