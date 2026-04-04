create or replace function clinical.refresh_patient_clinical_status(p_user_id uuid, p_patient_id uuid)
returns void
language plpgsql
security definer
set search_path = clinical, public
as $$
declare
  v_record_id uuid;
  v_has_record boolean;
  v_pending_evolution boolean;
  v_pending_document boolean;
  v_alert_level smallint;
  v_last_evolution_at timestamptz;
  v_last_entry_at timestamptz;
begin
  select mr.id, true, mr.last_entry_at
    into v_record_id, v_has_record, v_last_entry_at
  from clinical.medical_records mr
  where mr.user_id = p_user_id
    and mr.patient_id = p_patient_id
  limit 1;

  if v_record_id is null then
    v_has_record := false;
    v_pending_evolution := false;
    v_pending_document := false;
    v_alert_level := 0;
    v_last_evolution_at := null;
    v_last_entry_at := null;
  else
    select coalesce(bool_or(is_pending), false), max(evolution_date)
      into v_pending_evolution, v_last_evolution_at
    from clinical.medical_record_evolutions
    where medical_record_id = v_record_id;

    -- medical_record_documents has no status column; pending means a document row without generated PDF path.
    select coalesce(bool_or(generated_pdf_path is null), false)
      into v_pending_document
    from clinical.medical_record_documents
    where medical_record_id = v_record_id;

    select coalesce(max(alert_level), 0)
      into v_alert_level
    from clinical.medical_record_alerts
    where medical_record_id = v_record_id
      and status = 'active';
  end if;

  insert into public.patient_clinical_status (
    user_id, patient_id, medical_record_id, has_record, has_pending_evolution,
    has_pending_document, alert_level, last_evolution_at, last_entry_at, updated_at
  )
  values (
    p_user_id, p_patient_id, v_record_id, coalesce(v_has_record, false), coalesce(v_pending_evolution, false),
    coalesce(v_pending_document, false), coalesce(v_alert_level, 0), v_last_evolution_at, v_last_entry_at, now()
  )
  on conflict (user_id, patient_id) do update
  set medical_record_id = excluded.medical_record_id,
      has_record = excluded.has_record,
      has_pending_evolution = excluded.has_pending_evolution,
      has_pending_document = excluded.has_pending_document,
      alert_level = excluded.alert_level,
      last_evolution_at = excluded.last_evolution_at,
      last_entry_at = excluded.last_entry_at,
      updated_at = now();
end;
$$;