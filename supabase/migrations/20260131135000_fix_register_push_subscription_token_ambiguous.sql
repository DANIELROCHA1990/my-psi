-- Fix ambiguous token reference by qualifying columns and avoiding bare identifiers

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
  SELECT pct.patient_id
    INTO v_patient_id
  FROM public.push_consent_tokens pct
  WHERE pct.token = p_consent_token
    AND pct.revoked_at IS NULL
    AND (pct.expires_at IS NULL OR pct.expires_at > now())
  LIMIT 1;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'Invalid consent token' USING ERRCODE = '22023';
  END IF;

  SELECT ps.patient_id
    INTO v_existing_patient
  FROM public.push_subscriptions ps
  WHERE ps.token = p_token
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

  UPDATE public.push_consent_tokens pct
    SET used_at = now()
    WHERE pct.token = p_consent_token;

  RETURN QUERY
  SELECT ps.id,
         ps.patient_id,
         ps.token,
         ps.is_enabled,
         ps.created_at,
         ps.updated_at
  FROM public.push_subscriptions ps
  WHERE ps.token = p_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_push_subscription(text, text, text, text, jsonb) TO anon, authenticated;
