-- Allow service role to create push consent tokens without auth.uid()

CREATE OR REPLACE FUNCTION public.create_push_consent_token(
  p_patient_id uuid,
  p_expires_in_minutes integer DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token text;
  v_expires_at timestamptz;
  v_role text;
BEGIN
  v_role := current_setting('request.jwt.claim.role', true);

  IF NOT (
    auth.uid() IS NULL AND v_role IN ('service_role', 'supabase_admin')
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = p_patient_id
        AND p.user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Patient not accessible' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Revoke any previous active token for this patient to keep a single active link.
  UPDATE public.push_consent_tokens
    SET revoked_at = now()
    WHERE patient_id = p_patient_id
      AND revoked_at IS NULL;

  v_token := encode(gen_random_bytes(32), 'hex');

  IF p_expires_in_minutes IS NULL OR p_expires_in_minutes <= 0 THEN
    v_expires_at := NULL;
  ELSE
    v_expires_at := now() + make_interval(mins => GREATEST(p_expires_in_minutes, 5));
  END IF;

  INSERT INTO public.push_consent_tokens (patient_id, token, expires_at)
  VALUES (p_patient_id, v_token, v_expires_at);

  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_or_create_push_consent_token(
  p_patient_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token text;
  v_role text;
BEGIN
  v_role := current_setting('request.jwt.claim.role', true);

  IF NOT (
    auth.uid() IS NULL AND v_role IN ('service_role', 'supabase_admin')
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = p_patient_id
        AND p.user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Patient not accessible' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT token
    INTO v_token
  FROM public.push_consent_tokens
  WHERE patient_id = p_patient_id
    AND revoked_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_token IS NOT NULL THEN
    RETURN v_token;
  END IF;

  RETURN public.create_push_consent_token(p_patient_id, NULL);
END;
$$;
