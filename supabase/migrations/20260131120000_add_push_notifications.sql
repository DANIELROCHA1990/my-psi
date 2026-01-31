-- Push notifications: subscriptions, consent tokens, logs

CREATE TABLE IF NOT EXISTS public.push_consent_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  used_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_push_consent_tokens_patient_id ON public.push_consent_tokens(patient_id);
CREATE INDEX IF NOT EXISTS idx_push_consent_tokens_token ON public.push_consent_tokens(token);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  token text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'web',
  browser text,
  is_enabled boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz,
  meta jsonb
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_patient_id ON public.push_subscriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_enabled ON public.push_subscriptions(is_enabled);

CREATE TABLE IF NOT EXISTS public.push_notifications_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  date date NOT NULL,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  token text,
  status text NOT NULL,
  error text,
  payload jsonb
);

CREATE INDEX IF NOT EXISTS idx_push_notifications_log_patient_id ON public.push_notifications_log(patient_id);
CREATE INDEX IF NOT EXISTS idx_push_notifications_log_date ON public.push_notifications_log(date);

ALTER TABLE public.push_consent_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_notifications_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage consent tokens for their patients" ON public.push_consent_tokens;
CREATE POLICY "Users can manage consent tokens for their patients"
  ON public.push_consent_tokens
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = push_consent_tokens.patient_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = push_consent_tokens.patient_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can read push subscriptions for their patients" ON public.push_subscriptions;
CREATE POLICY "Users can read push subscriptions for their patients"
  ON public.push_subscriptions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = push_subscriptions.patient_id
        AND p.user_id = auth.uid()
    )
    OR push_subscriptions.patient_id = auth.uid()
  );

DROP POLICY IF EXISTS "Users can insert push subscriptions for their patients" ON public.push_subscriptions;
CREATE POLICY "Users can insert push subscriptions for their patients"
  ON public.push_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = push_subscriptions.patient_id
        AND p.user_id = auth.uid()
    )
    OR push_subscriptions.patient_id = auth.uid()
  );

DROP POLICY IF EXISTS "Users can update push subscriptions for their patients" ON public.push_subscriptions;
CREATE POLICY "Users can update push subscriptions for their patients"
  ON public.push_subscriptions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = push_subscriptions.patient_id
        AND p.user_id = auth.uid()
    )
    OR push_subscriptions.patient_id = auth.uid()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = push_subscriptions.patient_id
        AND p.user_id = auth.uid()
    )
    OR push_subscriptions.patient_id = auth.uid()
  );

DROP POLICY IF EXISTS "Users can delete push subscriptions for their patients" ON public.push_subscriptions;
CREATE POLICY "Users can delete push subscriptions for their patients"
  ON public.push_subscriptions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = push_subscriptions.patient_id
        AND p.user_id = auth.uid()
    )
    OR push_subscriptions.patient_id = auth.uid()
  );

DROP POLICY IF EXISTS "Users can read push logs for their patients" ON public.push_notifications_log;
CREATE POLICY "Users can read push logs for their patients"
  ON public.push_notifications_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = push_notifications_log.patient_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert push logs for their patients" ON public.push_notifications_log;
CREATE POLICY "Users can insert push logs for their patients"
  ON public.push_notifications_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = push_notifications_log.patient_id
        AND p.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.set_push_subscription_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_set_push_subscription_updated_at ON public.push_subscriptions;
CREATE TRIGGER trigger_set_push_subscription_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_push_subscription_updated_at();

CREATE OR REPLACE FUNCTION public.create_push_consent_token(
  p_patient_id uuid,
  p_expires_in_minutes integer DEFAULT 10080
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token text;
  v_expires_at timestamptz;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = p_patient_id
      AND p.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Patient not accessible' USING ERRCODE = '42501';
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_expires_at := now() + make_interval(mins => GREATEST(p_expires_in_minutes, 5));

  INSERT INTO public.push_consent_tokens (patient_id, token, expires_at)
  VALUES (p_patient_id, v_token, v_expires_at);

  RETURN v_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_push_consent_token(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.register_push_subscription(
  p_consent_token text,
  p_token text,
  p_platform text DEFAULT 'web',
  p_browser text DEFAULT NULL,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id uuid,
  patient_id uuid,
  token text,
  is_enabled boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_patient_id uuid;
  v_existing_patient uuid;
BEGIN
  SELECT patient_id
    INTO v_patient_id
  FROM public.push_consent_tokens
  WHERE token = p_consent_token
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'Invalid consent token' USING ERRCODE = '22023';
  END IF;

  SELECT patient_id
    INTO v_existing_patient
  FROM public.push_subscriptions
  WHERE token = p_token
  LIMIT 1;

  IF v_existing_patient IS NOT NULL AND v_existing_patient <> v_patient_id THEN
    RAISE EXCEPTION 'Token already linked to another patient' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.push_subscriptions (
    patient_id,
    token,
    platform,
    browser,
    is_enabled,
    last_seen_at,
    meta
  ) VALUES (
    v_patient_id,
    p_token,
    COALESCE(NULLIF(p_platform, ''), 'web'),
    p_browser,
    true,
    now(),
    p_meta
  )
  ON CONFLICT (token) DO UPDATE
    SET patient_id = EXCLUDED.patient_id,
        platform = EXCLUDED.platform,
        browser = EXCLUDED.browser,
        is_enabled = true,
        last_seen_at = now(),
        meta = EXCLUDED.meta,
        updated_at = now();

  UPDATE public.push_consent_tokens
    SET used_at = now()
    WHERE token = p_consent_token;

  RETURN QUERY
  SELECT ps.id, ps.patient_id, ps.token, ps.is_enabled, ps.created_at, ps.updated_at
  FROM public.push_subscriptions ps
  WHERE ps.token = p_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_push_subscription(text, text, text, text, jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_push_subscription_status(
  p_consent_token text,
  p_token text
)
RETURNS TABLE (
  is_enabled boolean,
  last_seen_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_patient_id uuid;
BEGIN
  SELECT patient_id
    INTO v_patient_id
  FROM public.push_consent_tokens
  WHERE token = p_consent_token
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'Invalid consent token' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT ps.is_enabled, ps.last_seen_at
  FROM public.push_subscriptions ps
  WHERE ps.token = p_token
    AND ps.patient_id = v_patient_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_push_subscription_status(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.disable_push_subscription(
  p_consent_token text,
  p_token text,
  p_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_patient_id uuid;
BEGIN
  SELECT patient_id
    INTO v_patient_id
  FROM public.push_consent_tokens
  WHERE token = p_consent_token
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'Invalid consent token' USING ERRCODE = '22023';
  END IF;

  UPDATE public.push_subscriptions
    SET is_enabled = false,
        meta = CASE
          WHEN p_reason IS NULL THEN meta
          ELSE jsonb_set(COALESCE(meta, '{}'::jsonb), '{disabled_reason}', to_jsonb(p_reason), true)
        END,
        updated_at = now()
  WHERE token = p_token
    AND patient_id = v_patient_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.disable_push_subscription(text, text, text) TO anon, authenticated;
