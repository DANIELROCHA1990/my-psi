/*
  # Add session link to patients

  1. Changes
    - Add `session_link` to `patients` table for storing meeting link
*/

alter table if exists public.patients
add column if not exists session_link text;
