create extension if not exists "pgcrypto";

create table public.patients (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid(),
    full_name text not null,
    email text,
    phone text,
    address text,
    created_at timestamptz default now(),
    birth_date date,
    cpf varchar(14),
    city text,
    state text,
    zip_code varchar(10),
    emergency_contact text,
    emergency_phone text,
    medical_history text,
    current_medications text,
    therapy_goals text,
    session_frequency text not null default 'weekly',
    session_price numeric(10,2),
    active boolean not null default true,
    updated_at timestamptz default now()
);
