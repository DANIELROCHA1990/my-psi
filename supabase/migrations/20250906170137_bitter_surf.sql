/*
  # Criar tabela de recibos

  1. New Tables
    - `receipts`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to users)
      - `patient_id` (uuid, foreign key to patients)
      - `session_id` (uuid, foreign key to sessions)
      - `receipt_number` (text, unique)
      - `amount` (numeric)
      - `issue_date` (date)
      - `status` (text, default 'generated')
      - `receipt_type` (text, default 'session')
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `receipts` table
    - Add policies for authenticated users to manage their own receipts
*/

CREATE TABLE IF NOT EXISTS receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  receipt_number text UNIQUE NOT NULL,
  amount numeric(10,2) NOT NULL,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'generated',
  receipt_type text NOT NULL DEFAULT 'session',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own receipts"
  ON receipts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own receipts"
  ON receipts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own receipts"
  ON receipts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own receipts"
  ON receipts
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
