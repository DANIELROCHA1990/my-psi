CREATE TABLE IF NOT EXISTS public.public_schedule_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_public_schedule_links_user_id ON public.public_schedule_links(user_id);
CREATE INDEX IF NOT EXISTS idx_public_schedule_links_token ON public.public_schedule_links(token);

ALTER TABLE public.public_schedule_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own schedule links" ON public.public_schedule_links;
CREATE POLICY "Users can manage own schedule links"
  ON public.public_schedule_links
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS is_temp boolean NOT NULL DEFAULT false;
