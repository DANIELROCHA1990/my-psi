/*
  # Remover tabela de lembretes antiga

  1. Changes
    - Drop the old `reminders` table as it's replaced by `notifications`
    - This table structure doesn't match the current application needs

  2. Notes
    - The reminders table will be replaced by the notifications table
    - All reminder functionality is now handled through notifications
*/

-- Drop the old reminders table if it exists
DROP TABLE IF EXISTS reminders CASCADE;