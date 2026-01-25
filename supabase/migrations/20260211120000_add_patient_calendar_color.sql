/*
  # Add calendar color to patients

  1. Changes
    - Add `calendar_color` to `patients` table for agenda styling
*/

alter table if exists public.patients
add column if not exists calendar_color text;
