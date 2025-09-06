/*
  # Fix patients table configuration

  1. Table Structure
    - Ensure proper foreign key references
    - Fix user_id column to reference auth.users
    - Add proper constraints and defaults

  2. Security
    - Update RLS policies to work with auth.users
    - Ensure proper user isolation

  3. Triggers
    - Add trigger to automatically set user_id from auth context
*/

-- First, let's ensure the patients table has the correct structure
ALTER TABLE patients 
DROP CONSTRAINT IF EXISTS patients_user_id_fkey;

-- Add the correct foreign key constraint
ALTER TABLE patients 
ADD CONSTRAINT patients_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Update the default value for user_id to use auth.uid()
ALTER TABLE patients 
ALTER COLUMN user_id SET DEFAULT auth.uid();

-- Drop existing RLS policies
DROP POLICY IF EXISTS "Users can read own patients" ON patients;
DROP POLICY IF EXISTS "Users can insert own patients" ON patients;
DROP POLICY IF EXISTS "Users can update own patients" ON patients;
DROP POLICY IF EXISTS "Users can delete own patients" ON patients;

-- Create new RLS policies that work with auth.users
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
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own patients"
  ON patients
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create or replace the trigger function to set user_id
CREATE OR REPLACE FUNCTION set_user_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.user_id = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_set_user_id ON patients;

-- Create the trigger
CREATE TRIGGER trigger_set_user_id
  BEFORE INSERT ON patients
  FOR EACH ROW
  EXECUTE FUNCTION set_user_id();

-- Ensure RLS is enabled
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;