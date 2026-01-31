-- Auto-create push consent token for existing and new patients

CREATE OR REPLACE FUNCTION public.ensure_patient_push_consent_token()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Only create if none active for this patient
  PERFORM public.get_or_create_push_consent_token(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_create_push_consent_token ON public.patients;
CREATE TRIGGER trigger_create_push_consent_token
  AFTER INSERT ON public.patients
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_patient_push_consent_token();

-- Backfill: create tokens for existing patients without an active token
INSERT INTO public.push_consent_tokens (patient_id, token, expires_at)
SELECT p.id,
       encode(gen_random_bytes(32), 'hex') as token,
       NULL as expires_at
FROM public.patients p
LEFT JOIN public.push_consent_tokens t
  ON t.patient_id = p.id
  AND t.revoked_at IS NULL
WHERE t.id IS NULL;
