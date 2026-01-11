/*
  # Ajustes de integra\u00e7\u00e3o

  1. Changes
    - Add summary column to sessions if missing
    - Align user_id foreign keys with auth.users where applicable
*/

ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS summary text;

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    ALTER TABLE public.profiles
      DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'profiles_user_id_fkey'
        AND conrelid = 'public.profiles'::regclass
    ) THEN
      ALTER TABLE public.profiles
        ADD CONSTRAINT profiles_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
  END IF;

  IF to_regclass('public.receipts') IS NOT NULL THEN
    ALTER TABLE public.receipts
      DROP CONSTRAINT IF EXISTS receipts_user_id_fkey;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'receipts_user_id_fkey'
        AND conrelid = 'public.receipts'::regclass
    ) THEN
      ALTER TABLE public.receipts
        ADD CONSTRAINT receipts_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
  END IF;

  IF to_regclass('public.notifications') IS NOT NULL THEN
    ALTER TABLE public.notifications
      DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'notifications_user_id_fkey'
        AND conrelid = 'public.notifications'::regclass
    ) THEN
      ALTER TABLE public.notifications
        ADD CONSTRAINT notifications_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
  END IF;

  IF to_regclass('public.financial_records') IS NOT NULL THEN
    ALTER TABLE public.financial_records
      DROP CONSTRAINT IF EXISTS financial_records_user_id_fkey;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'financial_records_user_id_fkey'
        AND conrelid = 'public.financial_records'::regclass
    ) THEN
      ALTER TABLE public.financial_records
        ADD CONSTRAINT financial_records_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;
