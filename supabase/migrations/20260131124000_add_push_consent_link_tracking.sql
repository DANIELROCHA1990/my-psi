-- Track consent link delivery + ensure single active token per patient

ALTER TABLE public.push_consent_tokens
  ADD COLUMN IF NOT EXISTS sent_to text,
  ADD COLUMN IF NOT EXISTS sent_via text,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_push_consent_tokens_sent_at ON public.push_consent_tokens(sent_at);

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
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = p_patient_id
      AND p.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Patient not accessible' USING ERRCODE = '42501';
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

GRANT EXECUTE ON FUNCTION public.create_push_consent_token(uuid, integer) TO authenticated;

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
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = p_patient_id
      AND p.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Patient not accessible' USING ERRCODE = '42501';
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

GRANT EXECUTE ON FUNCTION public.get_or_create_push_consent_token(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_push_consent_token_sent(
  p_token text,
  p_sent_to text,
  p_sent_via text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  UPDATE public.push_consent_tokens t
    SET sent_to = p_sent_to,
        sent_via = p_sent_via,
        sent_at = now()
  FROM public.patients p
  WHERE t.token = p_token
    AND t.patient_id = p.id
    AND p.user_id = auth.uid();

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_push_consent_token_sent(text, text, text) TO authenticated;
