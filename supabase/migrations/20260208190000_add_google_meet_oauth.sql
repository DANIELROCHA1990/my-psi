-- Google OAuth tokens (service role only)
create table if not exists public.google_oauth_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  token_type text,
  scope text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_oauth_tokens enable row level security;

-- Connection status visible to users
create table if not exists public.google_oauth_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  scope text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_oauth_connections enable row level security;

drop policy if exists "Users can view own google connection" on public.google_oauth_connections;
create policy "Users can view own google connection"
  on public.google_oauth_connections
  for select
  using (auth.uid() = user_id);

-- OAuth state storage (service role only)
create table if not exists public.google_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.google_oauth_states enable row level security;

-- Patient meet metadata
alter table public.patients
  add column if not exists meet_event_id text,
  add column if not exists meet_calendar_id text;
