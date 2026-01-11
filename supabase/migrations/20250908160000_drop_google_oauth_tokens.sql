/*
  # Drop google oauth token storage

  1. Changes
    - Drop `google_oauth_tokens` table if it exists
*/

drop table if exists public.google_oauth_tokens;
