/*
  # Remover notificacoes

  1. Changes
    - Drop da tabela notifications e relacionamentos associados
*/

DO $$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    DROP TABLE public.notifications CASCADE;
  END IF;
END $$;
