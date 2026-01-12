/*
  # Add signature to profiles

  1. Changes
    - Add signature_data (text) to store PNG data URLs
*/

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS signature_data text;
