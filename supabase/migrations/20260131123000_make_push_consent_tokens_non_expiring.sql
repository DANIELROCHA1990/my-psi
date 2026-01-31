-- Make push consent tokens non-expiring by default

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

UPDATE public.push_consent_tokens
SET expires_at = NULL
WHERE expires_at IS NOT NULL;
