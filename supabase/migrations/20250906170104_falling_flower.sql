/*
  # Atualizar tabela de pacientes

  1. Changes
    - Ensure all required columns exist
    - Add missing columns if needed
    - Update data types to match TypeScript interfaces
    - Add proper constraints and defaults

  2. Security
    - Enable RLS on `patients` table
    - Add policies for authenticated users to manage their own patients
*/

-- Update existing patients table structure
DO $$
BEGIN
  -- Add missing columns if they don't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'patients' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE patients ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;

  -- Ensure proper data types
  ALTER TABLE patients ALTER COLUMN session_price TYPE numeric(10,2);
  ALTER TABLE patients ALTER COLUMN created_at SET DEFAULT now();
END $$;

-- Ensure RLS is enabled
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can read own patients" ON patients;
DROP POLICY IF EXISTS "Users can insert own patients" ON patients;
DROP POLICY IF EXISTS "Users can update own patients" ON patients;
DROP POLICY IF EXISTS "Users can delete own patients" ON patients;

-- Create new policies
CREATE POLICY "Users can read own patients"
  ON patients
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own patients"
  ON patients
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own patients"
  ON patients
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own patients"
  ON patients
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);