/*
  # Criar tabela de sessões

  1. New Tables
    - `sessions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `patient_id` (uuid, foreign key to patients)
      - `session_date` (timestamptz)
      - `duration_minutes` (integer, default 50)
      - `session_type` (text, default 'individual')
      - `session_notes` (text, optional)
      - `mood_before` (text, optional)
      - `mood_after` (text, optional)
      - `homework_assigned` (text, optional)
      - `next_session_date` (timestamptz, optional)
      - `session_price` (numeric, optional)
      - `payment_status` (text, default 'pending')
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `sessions` table
    - Add policies for authenticated users to manage their own sessions

  3. Triggers
    - Add trigger to automatically set user_id from auth context
*/

-- Create sessions table if it doesn't exist
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  session_date timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 50,
  session_type text NOT NULL DEFAULT 'individual',
  session_notes text,
  mood_before text,
  mood_after text,
  homework_assigned text,
  next_session_date timestamptz,
  session_price numeric(10,2),
  payment_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can read own sessions" ON sessions;
DROP POLICY IF EXISTS "Users can insert own sessions" ON sessions;
DROP POLICY IF EXISTS "Users can update own sessions" ON sessions;
DROP POLICY IF EXISTS "Users can delete own sessions" ON sessions;

-- Create RLS policies
CREATE POLICY "Users can read own sessions"
  ON sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions"
  ON sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
  ON sessions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions"
  ON sessions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create or replace the trigger function to set user_id
CREATE OR REPLACE FUNCTION set_session_user_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.user_id = auth.uid();
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trigger_set_session_user_id ON sessions;
DROP TRIGGER IF EXISTS trigger_update_session_updated_at ON sessions;

-- Create triggers
CREATE TRIGGER trigger_set_session_user_id
  BEFORE INSERT ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION set_session_user_id();

CREATE TRIGGER trigger_update_session_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION set_session_user_id();

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_patient_id ON sessions(patient_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_sessions_payment_status ON sessions(payment_status);

DO $$
BEGIN
  IF to_regclass('public.receipts') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'receipts_session_id_fkey'
        AND conrelid = 'public.receipts'::regclass
    ) THEN
      ALTER TABLE public.receipts
        ADD CONSTRAINT receipts_session_id_fkey
        FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;
    END IF;
  END IF;

  IF to_regclass('public.notifications') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'notifications_session_id_fkey'
        AND conrelid = 'public.notifications'::regclass
    ) THEN
      ALTER TABLE public.notifications
        ADD CONSTRAINT notifications_session_id_fkey
        FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;
