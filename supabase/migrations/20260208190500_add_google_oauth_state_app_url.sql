alter table public.google_oauth_states
  add column if not exists app_url text;
