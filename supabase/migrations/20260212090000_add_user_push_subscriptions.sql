-- Add user push subscriptions table for professional notifications

CREATE TABLE IF NOT EXISTS public.user_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'web',
  browser text,
  is_enabled boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_push_subscriptions_user_id ON public.user_push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_push_subscriptions_enabled ON public.user_push_subscriptions(is_enabled);

ALTER TABLE public.user_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own push subscriptions" ON public.user_push_subscriptions;
CREATE POLICY "Users can read own push subscriptions"
  ON public.user_push_subscriptions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own push subscriptions" ON public.user_push_subscriptions;
CREATE POLICY "Users can insert own push subscriptions"
  ON public.user_push_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own push subscriptions" ON public.user_push_subscriptions;
CREATE POLICY "Users can update own push subscriptions"
  ON public.user_push_subscriptions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own push subscriptions" ON public.user_push_subscriptions;
CREATE POLICY "Users can delete own push subscriptions"
  ON public.user_push_subscriptions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.set_user_push_subscription_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_set_user_push_subscription_updated_at ON public.user_push_subscriptions;
CREATE TRIGGER trigger_set_user_push_subscription_updated_at
  BEFORE UPDATE ON public.user_push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_push_subscription_updated_at();
