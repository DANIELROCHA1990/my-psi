/*
  # Atualizar tabela de registros financeiros

  1. Changes
    - Add missing columns to match TypeScript interface
    - Update data types and constraints
    - Add proper foreign key relationships

  2. Security
    - Enable RLS on `financial_records` table
    - Add policies for authenticated users to manage their own records
*/

-- Add missing columns to financial_records table
DO $$
BEGIN
  -- Add user_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'financial_records' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE financial_records ADD COLUMN user_id uuid NOT NULL DEFAULT auth.uid();
    ALTER TABLE financial_records ADD CONSTRAINT financial_records_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  -- Add session_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'financial_records' AND column_name = 'session_id'
  ) THEN
    ALTER TABLE financial_records ADD COLUMN session_id uuid;
    ALTER TABLE financial_records ADD CONSTRAINT financial_records_session_id_fkey 
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL;
  END IF;

  -- Add transaction_type column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'financial_records' AND column_name = 'transaction_type'
  ) THEN
    ALTER TABLE financial_records ADD COLUMN transaction_type text NOT NULL DEFAULT 'income';
  END IF;

  -- Add payment_method column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'financial_records' AND column_name = 'payment_method'
  ) THEN
    ALTER TABLE financial_records ADD COLUMN payment_method text NOT NULL DEFAULT 'cash';
  END IF;

  -- Add transaction_date column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'financial_records' AND column_name = 'transaction_date'
  ) THEN
    ALTER TABLE financial_records ADD COLUMN transaction_date date NOT NULL DEFAULT CURRENT_DATE;
  END IF;

  -- Add category column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'financial_records' AND column_name = 'category'
  ) THEN
    ALTER TABLE financial_records ADD COLUMN category text;
  END IF;

  -- Rename payment_date to transaction_date if payment_date exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'financial_records' AND column_name = 'payment_date'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'financial_records' AND column_name = 'transaction_date'
  ) THEN
    ALTER TABLE financial_records RENAME COLUMN payment_date TO transaction_date;
  END IF;
END $$;

-- Ensure RLS is enabled
ALTER TABLE financial_records ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can read own financial records" ON financial_records;
DROP POLICY IF EXISTS "Users can insert own financial records" ON financial_records;
DROP POLICY IF EXISTS "Users can update own financial records" ON financial_records;
DROP POLICY IF EXISTS "Users can delete own financial records" ON financial_records;

-- Create new policies
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
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own financial records"
  ON financial_records
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);