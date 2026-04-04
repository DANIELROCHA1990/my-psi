-- Clinical module for My-Psi
-- Security-first: clinical data in dedicated schema + strict RLS + backend-only crypto flow

begin;

create extension if not exists pgcrypto;
create schema if not exists clinical;

revoke all on schema clinical from public;
revoke all on schema clinical from anon;
revoke all on schema clinical from authenticated;

grant usage on schema clinical to service_role;

create or replace function clinical.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function clinical.assert_patient_owner()
returns trigger
language plpgsql
security definer
set search_path = clinical, public
as $$
begin
  if not exists (
    select 1
    from public.patients p
    where p.id = new.patient_id
      and p.user_id = new.user_id
  ) then
    raise exception 'patient/user mismatch' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function clinical.assert_record_scope()
returns trigger
language plpgsql
security definer
set search_path = clinical, public
as $$
declare
  v_user_id uuid;
  v_patient_id uuid;
begin
  select mr.user_id, mr.patient_id
    into v_user_id, v_patient_id
  from clinical.medical_records mr
  where mr.id = new.medical_record_id;

  if v_user_id is null then
    raise exception 'medical_record not found' using errcode = '23503';
  end if;

  if new.user_id <> v_user_id or new.patient_id <> v_patient_id then
    raise exception 'record scope mismatch' using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function clinical.apply_owner_service_policies(p_table regclass)
returns void
language plpgsql
as $$
begin
  execute format('alter table %s enable row level security', p_table);
  execute format('alter table %s force row level security', p_table);

  execute format('drop policy if exists owner_select on %s', p_table);
  execute format('drop policy if exists owner_insert on %s', p_table);
  execute format('drop policy if exists owner_update on %s', p_table);
  execute format('drop policy if exists owner_delete on %s', p_table);
  execute format('drop policy if exists service_all on %s', p_table);

  execute format('create policy owner_select on %s for select to authenticated using (auth.uid() = user_id)', p_table);
  execute format('create policy owner_insert on %s for insert to authenticated with check (auth.uid() = user_id)', p_table);
  execute format('create policy owner_update on %s for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', p_table);
  execute format('create policy owner_delete on %s for delete to authenticated using (auth.uid() = user_id)', p_table);
  execute format('create policy service_all on %s for all to service_role using (true) with check (true)', p_table);
end;
$$;

create or replace function clinical.apply_service_only_policies(p_table regclass)
returns void
language plpgsql
as $$
begin
  execute format('alter table %s enable row level security', p_table);
  execute format('alter table %s force row level security', p_table);
  execute format('drop policy if exists owner_select on %s', p_table);
  execute format('drop policy if exists owner_insert on %s', p_table);
  execute format('drop policy if exists owner_update on %s', p_table);
  execute format('drop policy if exists owner_delete on %s', p_table);
  execute format('drop policy if exists service_all on %s', p_table);
  execute format('create policy service_all on %s for all to service_role using (true) with check (true)', p_table);
end;
$$;

DO $$
BEGIN
  IF to_regtype('clinical.medical_record_status') IS NULL THEN
    CREATE TYPE clinical.medical_record_status AS ENUM ('active', 'locked', 'archived');
  END IF;

  IF to_regtype('clinical.medical_entry_type') IS NULL THEN
    CREATE TYPE clinical.medical_entry_type AS ENUM (
      'anamnesis', 'objective_exam', 'evolution', 'prescription', 'document',
      'exam_request', 'referral', 'active_problem', 'intervention', 'alert',
      'attachment', 'note'
    );
  END IF;

  IF to_regtype('clinical.audit_result') IS NULL THEN
    CREATE TYPE clinical.audit_result AS ENUM ('success', 'denied', 'error');
  END IF;
END $$;

create table if not exists clinical.medical_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  record_status clinical.medical_record_status not null default 'active',
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  last_entry_at timestamptz,
  has_pending_evolution boolean not null default false,
  has_pending_document boolean not null default false,
  alert_level smallint not null default 0,
  encryption_key_version integer not null default 1,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, patient_id)
);

create index if not exists idx_medical_records_user_patient on clinical.medical_records(user_id, patient_id);
create index if not exists idx_medical_records_status on clinical.medical_records(record_status);

create trigger trg_medical_records_touch_updated_at
before update on clinical.medical_records
for each row execute function clinical.touch_updated_at();

create trigger trg_medical_records_assert_patient_owner
before insert or update on clinical.medical_records
for each row execute function clinical.assert_patient_owner();

create table if not exists clinical.medical_record_entries (
  id uuid primary key default gen_random_uuid(),
  medical_record_id uuid not null references clinical.medical_records(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  entry_type clinical.medical_entry_type not null,
  source_session_id uuid references public.sessions(id) on delete set null,
  event_at timestamptz not null default now(),
  title_redacted text,
  content_enc jsonb not null,
  content_sha256 text not null,
  crypto_version integer not null,
  has_sensitive_content boolean not null default true,
  is_deleted boolean not null default false,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_medical_entries_record_event on clinical.medical_record_entries(medical_record_id, event_at desc);
create index if not exists idx_medical_entries_user_patient on clinical.medical_record_entries(user_id, patient_id);
create index if not exists idx_medical_entries_source_session on clinical.medical_record_entries(source_session_id);

create trigger trg_medical_entries_touch_updated_at
before update on clinical.medical_record_entries
for each row execute function clinical.touch_updated_at();

create trigger trg_medical_entries_assert_scope
before insert or update on clinical.medical_record_entries
for each row execute function clinical.assert_record_scope();
create table if not exists clinical.medical_record_anamnesis (
  id uuid primary key default gen_random_uuid(),
  medical_record_id uuid not null references clinical.medical_records(id) on delete cascade,
  entry_id uuid references clinical.medical_record_entries(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  status text not null default 'active',
  recorded_at timestamptz not null default now(),
  anamnesis_text_enc jsonb not null,
  risk_clinical_enc jsonb,
  notes_private_enc jsonb,
  payload_sha256 text not null,
  crypto_version integer not null,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clinical.medical_record_objective_exams (
  id uuid primary key default gen_random_uuid(),
  medical_record_id uuid not null references clinical.medical_records(id) on delete cascade,
  entry_id uuid references clinical.medical_record_entries(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  exam_date timestamptz not null default now(),
  exam_type text not null default 'general',
  objective_exam_text_enc jsonb not null,
  observations_enc jsonb,
  payload_sha256 text not null,
  crypto_version integer not null,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clinical.medical_record_evolutions (
  id uuid primary key default gen_random_uuid(),
  medical_record_id uuid not null references clinical.medical_records(id) on delete cascade,
  entry_id uuid references clinical.medical_record_entries(id) on delete set null,
  session_id uuid references public.sessions(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  evolution_date timestamptz not null default now(),
  is_pending boolean not null default false,
  evolution_text_enc jsonb not null,
  clinical_hypothesis_enc jsonb,
  guidance_enc jsonb,
  payload_sha256 text not null,
  crypto_version integer not null,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clinical.medical_record_prescriptions (
  id uuid primary key default gen_random_uuid(),
  medical_record_id uuid not null references clinical.medical_records(id) on delete cascade,
  entry_id uuid references clinical.medical_record_entries(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  prescription_date timestamptz not null default now(),
  valid_until date,
  status text not null default 'active',
  prescription_detail_enc jsonb not null,
  notes_enc jsonb,
  payload_sha256 text not null,
  crypto_version integer not null,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clinical.medical_record_documents (
  id uuid primary key default gen_random_uuid(),
  medical_record_id uuid not null references clinical.medical_records(id) on delete cascade,
  entry_id uuid references clinical.medical_record_entries(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  template_id uuid references public.document_templates(id) on delete set null,
  document_type text not null,
  sensitivity_level text not null default 'clinical',
  generated_pdf_path text,
  document_text_enc jsonb,
  payload_sha256 text,
  crypto_version integer,
  generated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clinical.medical_record_exam_requests (
  id uuid primary key default gen_random_uuid(),
  medical_record_id uuid not null references clinical.medical_records(id) on delete cascade,
  entry_id uuid references clinical.medical_record_entries(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  request_date timestamptz not null default now(),
  status text not null default 'requested',
  exam_request_text_enc jsonb not null,
  rationale_enc jsonb,
  payload_sha256 text not null,
  crypto_version integer not null,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists clinical.medical_record_referrals (
  id uuid primary key default gen_random_uuid(),
  medical_record_id uuid not null references clinical.medical_records(id) on delete cascade,
  entry_id uuid references clinical.medical_record_entries(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  referral_date timestamptz not null default now(),
  status text not null default 'active',
  referral_description_enc jsonb not null,
  referral_target_enc jsonb,
  payload_sha256 text not null,
  crypto_version integer not null,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clinical.medical_record_active_problems (
  id uuid primary key default gen_random_uuid(),
  medical_record_id uuid not null references clinical.medical_records(id) on delete cascade,
  entry_id uuid references clinical.medical_record_entries(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  status text not null default 'active',
  operational_severity smallint not null default 1,
  started_at timestamptz not null default now(),
  resolved_at timestamptz,
  problem_text_enc jsonb not null,
  payload_sha256 text not null,
  crypto_version integer not null,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clinical.medical_record_current_interventions (
  id uuid primary key default gen_random_uuid(),
  medical_record_id uuid not null references clinical.medical_records(id) on delete cascade,
  entry_id uuid references clinical.medical_record_entries(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  status text not null default 'active',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  intervention_text_enc jsonb not null,
  payload_sha256 text not null,
  crypto_version integer not null,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clinical.medical_record_alerts (
  id uuid primary key default gen_random_uuid(),
  medical_record_id uuid not null references clinical.medical_records(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  alert_code text not null,
  alert_level smallint not null default 1,
  status text not null default 'active',
  alert_text_enc jsonb,
  payload_sha256 text,
  crypto_version integer,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clinical.medical_record_attachments (
  id uuid primary key default gen_random_uuid(),
  medical_record_id uuid not null references clinical.medical_records(id) on delete cascade,
  entry_id uuid references clinical.medical_record_entries(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  bucket_id text not null default 'clinical-attachments-private',
  object_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  file_ext text,
  original_name_enc jsonb not null,
  metadata_enc jsonb,
  checksum_sha256 text,
  classification text not null default 'clinical',
  uploaded_by uuid not null references auth.users(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clinical.medical_record_access_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid,
  patient_id uuid references public.patients(id) on delete set null,
  medical_record_id uuid references clinical.medical_records(id) on delete set null,
  resource_type text not null,
  resource_id uuid,
  action text not null,
  purpose text,
  origin text,
  request_id uuid,
  ip inet,
  user_agent text,
  result clinical.audit_result not null,
  result_code text,
  created_at timestamptz not null default now()
);

create table if not exists clinical.medical_record_change_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  patient_id uuid not null references public.patients(id) on delete cascade,
  medical_record_id uuid not null references clinical.medical_records(id) on delete cascade,
  resource_type text not null,
  resource_id uuid not null,
  action text not null,
  before_checksum text,
  after_checksum text,
  change_summary_redacted text,
  diff_enc jsonb,
  crypto_version integer,
  created_at timestamptz not null default now()
);

create table if not exists clinical.medical_record_export_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  patient_id uuid not null references public.patients(id) on delete cascade,
  medical_record_id uuid not null references clinical.medical_records(id) on delete cascade,
  export_type text not null,
  file_path text,
  export_reason text,
  result clinical.audit_result not null,
  result_code text,
  created_at timestamptz not null default now()
);

create table if not exists clinical.medical_record_retention_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid,
  patient_id uuid references public.patients(id) on delete set null,
  medical_record_id uuid references clinical.medical_records(id) on delete set null,
  event_type text not null,
  policy_version text not null,
  details_redacted jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_anamnesis_record on clinical.medical_record_anamnesis(medical_record_id, recorded_at desc);
create index if not exists idx_objective_record on clinical.medical_record_objective_exams(medical_record_id, exam_date desc);
create index if not exists idx_evolutions_record on clinical.medical_record_evolutions(medical_record_id, evolution_date desc);
create index if not exists idx_evolutions_pending on clinical.medical_record_evolutions(user_id, patient_id, is_pending);
create index if not exists idx_prescriptions_record on clinical.medical_record_prescriptions(medical_record_id, prescription_date desc);
create index if not exists idx_documents_record on clinical.medical_record_documents(medical_record_id, created_at desc);
create index if not exists idx_exam_requests_record on clinical.medical_record_exam_requests(medical_record_id, request_date desc);
create index if not exists idx_referrals_record on clinical.medical_record_referrals(medical_record_id, referral_date desc);
create index if not exists idx_active_problems_record on clinical.medical_record_active_problems(medical_record_id, status);
create index if not exists idx_interventions_record on clinical.medical_record_current_interventions(medical_record_id, status);
create index if not exists idx_alerts_record on clinical.medical_record_alerts(medical_record_id, status, alert_level);
create index if not exists idx_attachments_record on clinical.medical_record_attachments(medical_record_id, created_at desc);
create index if not exists idx_access_audit_user_patient_date on clinical.medical_record_access_audit(user_id, patient_id, created_at desc);
create index if not exists idx_change_history_record_date on clinical.medical_record_change_history(medical_record_id, created_at desc);
create index if not exists idx_export_log_record_date on clinical.medical_record_export_log(medical_record_id, created_at desc);
create index if not exists idx_retention_events_record_date on clinical.medical_record_retention_events(medical_record_id, created_at desc);

create trigger trg_anamnesis_touch_updated_at before update on clinical.medical_record_anamnesis for each row execute function clinical.touch_updated_at();
create trigger trg_objective_touch_updated_at before update on clinical.medical_record_objective_exams for each row execute function clinical.touch_updated_at();
create trigger trg_evolution_touch_updated_at before update on clinical.medical_record_evolutions for each row execute function clinical.touch_updated_at();
create trigger trg_prescription_touch_updated_at before update on clinical.medical_record_prescriptions for each row execute function clinical.touch_updated_at();
create trigger trg_document_touch_updated_at before update on clinical.medical_record_documents for each row execute function clinical.touch_updated_at();
create trigger trg_exam_request_touch_updated_at before update on clinical.medical_record_exam_requests for each row execute function clinical.touch_updated_at();
create trigger trg_referral_touch_updated_at before update on clinical.medical_record_referrals for each row execute function clinical.touch_updated_at();
create trigger trg_active_problem_touch_updated_at before update on clinical.medical_record_active_problems for each row execute function clinical.touch_updated_at();
create trigger trg_intervention_touch_updated_at before update on clinical.medical_record_current_interventions for each row execute function clinical.touch_updated_at();
create trigger trg_alert_touch_updated_at before update on clinical.medical_record_alerts for each row execute function clinical.touch_updated_at();
create trigger trg_attachment_touch_updated_at before update on clinical.medical_record_attachments for each row execute function clinical.touch_updated_at();

create trigger trg_anamnesis_assert_scope before insert or update on clinical.medical_record_anamnesis for each row execute function clinical.assert_record_scope();
create trigger trg_objective_assert_scope before insert or update on clinical.medical_record_objective_exams for each row execute function clinical.assert_record_scope();
create trigger trg_evolution_assert_scope before insert or update on clinical.medical_record_evolutions for each row execute function clinical.assert_record_scope();
create trigger trg_prescription_assert_scope before insert or update on clinical.medical_record_prescriptions for each row execute function clinical.assert_record_scope();
create trigger trg_document_assert_scope before insert or update on clinical.medical_record_documents for each row execute function clinical.assert_record_scope();
create trigger trg_exam_request_assert_scope before insert or update on clinical.medical_record_exam_requests for each row execute function clinical.assert_record_scope();
create trigger trg_referral_assert_scope before insert or update on clinical.medical_record_referrals for each row execute function clinical.assert_record_scope();
create trigger trg_active_problem_assert_scope before insert or update on clinical.medical_record_active_problems for each row execute function clinical.assert_record_scope();
create trigger trg_intervention_assert_scope before insert or update on clinical.medical_record_current_interventions for each row execute function clinical.assert_record_scope();
create trigger trg_alert_assert_scope before insert or update on clinical.medical_record_alerts for each row execute function clinical.assert_record_scope();
create trigger trg_attachment_assert_scope before insert or update on clinical.medical_record_attachments for each row execute function clinical.assert_record_scope();

select clinical.apply_service_only_policies('clinical.medical_records'::regclass);
select clinical.apply_service_only_policies('clinical.medical_record_entries'::regclass);
select clinical.apply_service_only_policies('clinical.medical_record_anamnesis'::regclass);
select clinical.apply_service_only_policies('clinical.medical_record_objective_exams'::regclass);
select clinical.apply_service_only_policies('clinical.medical_record_evolutions'::regclass);
select clinical.apply_service_only_policies('clinical.medical_record_prescriptions'::regclass);
select clinical.apply_service_only_policies('clinical.medical_record_documents'::regclass);
select clinical.apply_service_only_policies('clinical.medical_record_exam_requests'::regclass);
select clinical.apply_service_only_policies('clinical.medical_record_referrals'::regclass);
select clinical.apply_service_only_policies('clinical.medical_record_active_problems'::regclass);
select clinical.apply_service_only_policies('clinical.medical_record_current_interventions'::regclass);
select clinical.apply_service_only_policies('clinical.medical_record_alerts'::regclass);
select clinical.apply_service_only_policies('clinical.medical_record_attachments'::regclass);

select clinical.apply_service_only_policies('clinical.medical_record_access_audit'::regclass);
select clinical.apply_service_only_policies('clinical.medical_record_change_history'::regclass);
select clinical.apply_service_only_policies('clinical.medical_record_export_log'::regclass);
select clinical.apply_service_only_policies('clinical.medical_record_retention_events'::regclass);

grant select, insert, update, delete on all tables in schema clinical to service_role;
grant usage, select on all sequences in schema clinical to service_role;
create table if not exists public.patient_clinical_status (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  medical_record_id uuid references clinical.medical_records(id) on delete set null,
  has_record boolean not null default false,
  has_pending_evolution boolean not null default false,
  has_pending_document boolean not null default false,
  alert_level smallint not null default 0,
  last_evolution_at timestamptz,
  last_entry_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(user_id, patient_id)
);

alter table public.patient_clinical_status enable row level security;
alter table public.patient_clinical_status force row level security;

drop policy if exists "Users can read own patient clinical status" on public.patient_clinical_status;
create policy "Users can read own patient clinical status"
on public.patient_clinical_status
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can upsert own patient clinical status" on public.patient_clinical_status;
drop policy if exists "Service role full patient clinical status access" on public.patient_clinical_status;
create policy "Service role full patient clinical status access"
on public.patient_clinical_status
for all
to service_role
using (true)
with check (true);

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

create or replace function clinical.refresh_status_trigger()
returns trigger
language plpgsql
security definer
set search_path = clinical, public
as $$
declare
  v_user uuid;
  v_patient uuid;
begin
  if tg_op = 'DELETE' then
    v_user := old.user_id;
    v_patient := old.patient_id;
  else
    v_user := new.user_id;
    v_patient := new.patient_id;
  end if;

  perform clinical.refresh_patient_clinical_status(v_user, v_patient);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_medical_records_refresh_status on clinical.medical_records;
create trigger trg_medical_records_refresh_status
after insert or update or delete on clinical.medical_records
for each row execute function clinical.refresh_status_trigger();

drop trigger if exists trg_evolutions_refresh_status on clinical.medical_record_evolutions;
create trigger trg_evolutions_refresh_status
after insert or update or delete on clinical.medical_record_evolutions
for each row execute function clinical.refresh_status_trigger();

drop trigger if exists trg_documents_refresh_status on clinical.medical_record_documents;
create trigger trg_documents_refresh_status
after insert or update or delete on clinical.medical_record_documents
for each row execute function clinical.refresh_status_trigger();

drop trigger if exists trg_alerts_refresh_status on clinical.medical_record_alerts;
create trigger trg_alerts_refresh_status
after insert or update or delete on clinical.medical_record_alerts
for each row execute function clinical.refresh_status_trigger();

insert into storage.buckets (id, name, public)
values ('clinical-attachments-private', 'clinical-attachments-private', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('clinical-exports-private', 'clinical-exports-private', false)
on conflict (id) do nothing;

drop policy if exists "Service role manages clinical storage objects" on storage.objects;
create policy "Service role manages clinical storage objects"
on storage.objects
for all
to service_role
using (bucket_id in ('clinical-attachments-private', 'clinical-exports-private'))
with check (bucket_id in ('clinical-attachments-private', 'clinical-exports-private'));

alter table public.sessions
  add column if not exists operational_summary text,
  add column if not exists has_clinical_entry boolean not null default false,
  add column if not exists requires_clinical_evolution boolean not null default false,
  add column if not exists clinical_last_updated_at timestamptz,
  add column if not exists clinical_entry_id uuid;

create or replace function clinical.sanitize_legacy_session_fields()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(trim(new.operational_summary), '') = '' and coalesce(trim(new.summary), '') <> '' then
      new.operational_summary := left(trim(new.summary), 255);
    end if;
    if coalesce(trim(new.operational_summary), '') <> '' then
      new.operational_summary := left(trim(new.operational_summary), 255);
    end if;
    new.summary := null;
    new.session_notes := null;
    new.mood_before := null;
    new.mood_after := null;
    new.homework_assigned := null;
    return new;
  end if;

  if coalesce(trim(new.operational_summary), '') = ''
     and new.summary is distinct from old.summary
     and coalesce(trim(new.summary), '') <> '' then
    new.operational_summary := left(trim(new.summary), 255);
  end if;

  if coalesce(trim(new.operational_summary), '') <> '' then
    new.operational_summary := left(trim(new.operational_summary), 255);
  end if;

  if new.summary is distinct from old.summary and not (old.summary is not null and new.summary is null) then
    new.summary := old.summary;
  end if;
  if new.session_notes is distinct from old.session_notes and not (old.session_notes is not null and new.session_notes is null) then
    new.session_notes := old.session_notes;
  end if;
  if new.mood_before is distinct from old.mood_before and not (old.mood_before is not null and new.mood_before is null) then
    new.mood_before := old.mood_before;
  end if;
  if new.mood_after is distinct from old.mood_after and not (old.mood_after is not null and new.mood_after is null) then
    new.mood_after := old.mood_after;
  end if;
  if new.homework_assigned is distinct from old.homework_assigned and not (old.homework_assigned is not null and new.homework_assigned is null) then
    new.homework_assigned := old.homework_assigned;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sessions_sanitize_legacy_clinical_fields on public.sessions;
create trigger trg_sessions_sanitize_legacy_clinical_fields
before insert or update on public.sessions
for each row execute function clinical.sanitize_legacy_session_fields();

create or replace function clinical.sanitize_legacy_patient_fields()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.medical_history := null;
    new.current_medications := null;
    new.therapy_goals := null;
    return new;
  end if;

  if new.medical_history is distinct from old.medical_history and not (old.medical_history is not null and new.medical_history is null) then
    new.medical_history := old.medical_history;
  end if;
  if new.current_medications is distinct from old.current_medications and not (old.current_medications is not null and new.current_medications is null) then
    new.current_medications := old.current_medications;
  end if;
  if new.therapy_goals is distinct from old.therapy_goals and not (old.therapy_goals is not null and new.therapy_goals is null) then
    new.therapy_goals := old.therapy_goals;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_patients_sanitize_legacy_clinical_fields on public.patients;
create trigger trg_patients_sanitize_legacy_clinical_fields
before insert or update on public.patients
for each row execute function clinical.sanitize_legacy_patient_fields();

comment on column public.sessions.summary is 'DEPRECATED: nao usar para texto clinico sensivel';
comment on column public.sessions.session_notes is 'DEPRECATED: texto clinico migrado para schema clinical';
comment on column public.sessions.mood_before is 'DEPRECATED: texto clinico migrado para schema clinical';
comment on column public.sessions.mood_after is 'DEPRECATED: texto clinico migrado para schema clinical';
comment on column public.sessions.homework_assigned is 'DEPRECATED: texto clinico migrado para schema clinical';
comment on column public.patients.medical_history is 'DEPRECATED: texto clinico migrado para schema clinical';
comment on column public.patients.current_medications is 'DEPRECATED: texto clinico migrado para schema clinical';
comment on column public.patients.therapy_goals is 'DEPRECATED: texto clinico migrado para schema clinical';

commit;
