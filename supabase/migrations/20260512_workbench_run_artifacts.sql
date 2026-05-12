create extension if not exists pgcrypto with schema extensions;

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_id uuid references public.agent_run_usage(id) on delete set null,
  runtime_run_id text,
  mode text not null default 'agent',
  status text not null default 'running',
  intent text,
  prompt text,
  plan jsonb not null default '{}'::jsonb,
  data_source_snapshot jsonb not null default '{}'::jsonb,
  chart_data jsonb not null default '{}'::jsonb,
  conclusion text,
  conclusion_source text,
  report_state text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  elapsed_ms integer,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  constraint agent_runs_mode_check check (mode in ('mock', 'agent')),
  constraint agent_runs_status_check check (status in ('pending', 'running', 'completed', 'failed', 'stopped')),
  constraint agent_runs_elapsed_ms_check check (elapsed_ms is null or elapsed_ms >= 0)
);

create table if not exists public.run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seq integer not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint run_events_seq_check check (seq >= 0),
  constraint run_events_run_seq_unique unique (run_id, seq)
);

create table if not exists public.tool_invocations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_name text not null,
  display_name text not null,
  status text not null default 'running',
  input jsonb not null default '{}'::jsonb,
  input_summary text,
  output jsonb not null default '{}'::jsonb,
  output_summary text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  elapsed_ms integer,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  constraint tool_invocations_status_check check (status in ('pending', 'running', 'completed', 'failed', 'skipped')),
  constraint tool_invocations_elapsed_ms_check check (elapsed_ms is null or elapsed_ms >= 0)
);

create table if not exists public.report_artifacts (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  run_id uuid references public.agent_runs(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content_markdown text not null,
  status text not null default 'generated',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint report_artifacts_status_check check (status in ('draft', 'generated', 'archived')),
  constraint report_artifacts_version_check check (version >= 1),
  constraint report_artifacts_content_check check (length(trim(content_markdown)) > 0)
);

create index if not exists agent_runs_user_started_idx
  on public.agent_runs (user_id, started_at desc);

create index if not exists agent_runs_conversation_started_idx
  on public.agent_runs (conversation_id, started_at desc);

create index if not exists agent_runs_usage_idx
  on public.agent_runs (usage_id);

create index if not exists agent_runs_runtime_run_id_idx
  on public.agent_runs (runtime_run_id);

create index if not exists run_events_run_seq_idx
  on public.run_events (run_id, seq asc);

create index if not exists run_events_conversation_created_idx
  on public.run_events (conversation_id, created_at asc);

create index if not exists run_events_user_created_idx
  on public.run_events (user_id, created_at desc);

create index if not exists tool_invocations_user_started_idx
  on public.tool_invocations (user_id, started_at desc);

create index if not exists tool_invocations_user_tool_started_idx
  on public.tool_invocations (user_id, tool_name, started_at desc);

create index if not exists tool_invocations_run_started_idx
  on public.tool_invocations (run_id, started_at asc);

create index if not exists tool_invocations_conversation_started_idx
  on public.tool_invocations (conversation_id, started_at asc);

create index if not exists report_artifacts_user_created_idx
  on public.report_artifacts (user_id, created_at desc);

create index if not exists report_artifacts_conversation_created_idx
  on public.report_artifacts (conversation_id, created_at desc);

create index if not exists report_artifacts_run_idx
  on public.report_artifacts (run_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists report_artifacts_set_updated_at on public.report_artifacts;
create trigger report_artifacts_set_updated_at
before update on public.report_artifacts
for each row
execute function public.set_updated_at();

alter table public.agent_runs enable row level security;
alter table public.run_events enable row level security;
alter table public.tool_invocations enable row level security;
alter table public.report_artifacts enable row level security;

drop policy if exists agent_runs_select_own on public.agent_runs;
create policy agent_runs_select_own
on public.agent_runs
for select
using (user_id = auth.uid());

drop policy if exists run_events_select_own on public.run_events;
create policy run_events_select_own
on public.run_events
for select
using (user_id = auth.uid());

drop policy if exists tool_invocations_select_own on public.tool_invocations;
create policy tool_invocations_select_own
on public.tool_invocations
for select
using (user_id = auth.uid());

drop policy if exists report_artifacts_select_own on public.report_artifacts;
create policy report_artifacts_select_own
on public.report_artifacts
for select
using (user_id = auth.uid());
