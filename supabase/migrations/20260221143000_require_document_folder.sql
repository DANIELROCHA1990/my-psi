-- Ensure every template belongs to a folder.
with users_without_folder as (
  select distinct dt.user_id
  from public.document_templates dt
  left join public.document_folders df
    on df.user_id = dt.user_id
  where dt.folder_id is null
    and df.id is null
),
created_folders as (
  insert into public.document_folders (user_id, name)
  select user_id, 'Pasta inicial'
  from users_without_folder
  returning id, user_id
),
fallback_folders as (
  select id, user_id from created_folders
  union all
  select distinct on (df.user_id) df.id, df.user_id
  from public.document_folders df
  join public.document_templates dt on dt.user_id = df.user_id
  where dt.folder_id is null
  order by df.user_id, df.created_at asc
)
update public.document_templates dt
set folder_id = ff.id
from fallback_folders ff
where dt.user_id = ff.user_id
  and dt.folder_id is null;

alter table public.document_templates
  alter column folder_id set not null;

alter table public.document_templates
  drop constraint if exists document_templates_folder_id_fkey;

alter table public.document_templates
  add constraint document_templates_folder_id_fkey
  foreign key (folder_id) references public.document_folders(id) on delete restrict;
