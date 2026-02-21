create table if not exists public.document_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  folder_id uuid references public.document_folders(id) on delete set null,
  title text not null,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_template_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  template_id uuid not null references public.document_templates(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(template_id, patient_id)
);

create index if not exists idx_document_folders_user_id on public.document_folders(user_id);
create index if not exists idx_document_templates_user_id on public.document_templates(user_id);
create index if not exists idx_document_templates_folder_id on public.document_templates(folder_id);
create index if not exists idx_document_template_assignments_user_id on public.document_template_assignments(user_id);
create index if not exists idx_document_template_assignments_template_id on public.document_template_assignments(template_id);
create index if not exists idx_document_template_assignments_patient_id on public.document_template_assignments(patient_id);

alter table public.document_folders enable row level security;
alter table public.document_templates enable row level security;
alter table public.document_template_assignments enable row level security;

drop policy if exists "Users can read own document folders" on public.document_folders;
create policy "Users can read own document folders"
  on public.document_folders
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own document folders" on public.document_folders;
create policy "Users can insert own document folders"
  on public.document_folders
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own document folders" on public.document_folders;
create policy "Users can update own document folders"
  on public.document_folders
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own document folders" on public.document_folders;
create policy "Users can delete own document folders"
  on public.document_folders
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can read own document templates" on public.document_templates;
create policy "Users can read own document templates"
  on public.document_templates
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own document templates" on public.document_templates;
create policy "Users can insert own document templates"
  on public.document_templates
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own document templates" on public.document_templates;
create policy "Users can update own document templates"
  on public.document_templates
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own document templates" on public.document_templates;
create policy "Users can delete own document templates"
  on public.document_templates
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can read own document assignments" on public.document_template_assignments;
create policy "Users can read own document assignments"
  on public.document_template_assignments
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own document assignments" on public.document_template_assignments;
create policy "Users can insert own document assignments"
  on public.document_template_assignments
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own document assignments" on public.document_template_assignments;
create policy "Users can delete own document assignments"
  on public.document_template_assignments
  for delete
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.set_documents_user_id_and_updated_at()
returns trigger
language plpgsql
security definer
as $$
begin
  new.user_id = auth.uid();
  if to_jsonb(new) ? 'updated_at' then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_set_document_folder_user on public.document_folders;
create trigger trigger_set_document_folder_user
  before insert or update on public.document_folders
  for each row
  execute function public.set_documents_user_id_and_updated_at();

drop trigger if exists trigger_set_document_template_user on public.document_templates;
create trigger trigger_set_document_template_user
  before insert or update on public.document_templates
  for each row
  execute function public.set_documents_user_id_and_updated_at();

drop trigger if exists trigger_set_document_assignment_user on public.document_template_assignments;
create trigger trigger_set_document_assignment_user
  before insert on public.document_template_assignments
  for each row
  execute function public.set_documents_user_id_and_updated_at();
