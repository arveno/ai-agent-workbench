create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'demo_user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_role_check check (role in ('demo_user', 'admin'))
);

create table if not exists public.agent_run_quota (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quota_type text not null default 'agent_run',
  quota_limit integer not null default 20,
  quota_used integer not null default 0,
  period_start timestamptz not null default date_trunc('month', now()),
  period_end timestamptz default (date_trunc('month', now()) + interval '1 month'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_run_quota_type_check check (quota_type = 'agent_run'),
  constraint agent_run_quota_limit_check check (quota_limit >= 0),
  constraint agent_run_quota_used_check check (quota_used >= 0 and quota_used <= quota_limit),
  constraint agent_run_quota_user_period_unique unique (user_id, quota_type, period_start)
);

create table if not exists public.agent_run_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id text,
  quota_type text not null default 'agent_run',
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  constraint agent_run_usage_type_check check (quota_type = 'agent_run'),
  constraint agent_run_usage_status_check check (status in ('started', 'completed', 'failed', 'stopped'))
);

create index if not exists agent_run_quota_user_type_idx
  on public.agent_run_quota (user_id, quota_type, period_start desc);

create index if not exists agent_run_usage_user_started_idx
  on public.agent_run_usage (user_id, started_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists agent_run_quota_set_updated_at on public.agent_run_quota;
create trigger agent_run_quota_set_updated_at
before update on public.agent_run_quota
for each row
execute function public.set_updated_at();

create or replace function public.create_profile_and_quota_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null or length(trim(new.email)) = 0 then
    return new;
  end if;

  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'demo_user')
  on conflict (id) do nothing;

  insert into public.agent_run_quota (
    user_id,
    quota_type,
    quota_limit,
    quota_used,
    period_start
  )
  values (
    new.id,
    'agent_run',
    20,
    0,
    date_trunc('month', now())
  )
  on conflict (user_id, quota_type, period_start) do nothing;

  return new;
end;
$$;

drop trigger if exists create_profile_for_new_user on auth.users;
drop trigger if exists create_profile_and_quota_for_new_user on auth.users;
create trigger create_profile_and_quota_for_new_user
after insert on auth.users
for each row
execute function public.create_profile_and_quota_for_new_user();

insert into public.profiles (id, email, role)
select id, email, 'demo_user'
from auth.users
where email is not null and length(trim(email)) > 0
on conflict (id) do nothing;

insert into public.agent_run_quota (
  user_id,
  quota_type,
  quota_limit,
  quota_used,
  period_start
)
select
  id,
  'agent_run',
  20,
  0,
  date_trunc('month', now())
from auth.users
where email is not null and length(trim(email)) > 0
on conflict (user_id, quota_type, period_start) do nothing;

alter table public.profiles enable row level security;
alter table public.agent_run_quota enable row level security;
alter table public.agent_run_usage enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists agent_run_quota_select_own on public.agent_run_quota;
create policy agent_run_quota_select_own
on public.agent_run_quota
for select
using (auth.uid() = user_id);

drop policy if exists agent_run_usage_select_own on public.agent_run_usage;
create policy agent_run_usage_select_own
on public.agent_run_usage
for select
using (auth.uid() = user_id);
