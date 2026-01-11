/*
  # Add auto renew settings for patients

  1. Changes
    - add auto_renew_sessions boolean
    - add session_schedules jsonb
*/

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS auto_renew_sessions boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS session_schedules jsonb;
