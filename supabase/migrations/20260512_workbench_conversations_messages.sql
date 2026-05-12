create extension if not exists pgcrypto with schema extensions;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '新会话',
  summary text,
  mode text not null default 'mock',
  status text not null default 'active',
  visibility text not null default 'private',
  source_template_id uuid,
  latest_run_id uuid,
  message_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint conversations_mode_check check (mode in ('mock', 'agent', 'mixed')),
  constraint conversations_status_check check (status in ('active', 'running', 'completed', 'failed', 'archived')),
  constraint conversations_visibility_check check (visibility in ('private', 'demo', 'system')),
  constraint conversations_message_count_check check (message_count >= 0)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  kind text not null default 'text',
  content text not null default '',
  run_id uuid,
  client_message_id text,
  status text not null default 'completed',
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint messages_role_check check (role in ('user', 'assistant', 'system')),
  constraint messages_kind_check check (kind in ('text', 'tool_summary', 'report', 'error', 'system_notice')),
  constraint messages_status_check check (status in ('pending', 'streaming', 'completed', 'failed'))
);

create index if not exists conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);

create index if not exists conversations_user_status_updated_idx
  on public.conversations (user_id, status, updated_at desc);

create index if not exists conversations_source_template_idx
  on public.conversations (source_template_id);

create index if not exists conversations_latest_run_idx
  on public.conversations (latest_run_id);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at asc);

create index if not exists messages_user_created_idx
  on public.messages (user_id, created_at desc);

create index if not exists messages_run_idx
  on public.messages (run_id);

create unique index if not exists messages_user_client_message_unique_idx
  on public.messages (user_id, client_message_id)
  where client_message_id is not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
before update on public.conversations
for each row
execute function public.set_updated_at();

create or replace function public.update_conversation_message_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.conversations
    set
      message_count = message_count + 1,
      updated_at = now()
    where id = new.conversation_id;

    return new;
  end if;

  if tg_op = 'DELETE' then
    update public.conversations
    set
      message_count = greatest(message_count - 1, 0),
      updated_at = now()
    where id = old.conversation_id;

    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists messages_update_conversation_count_after_insert on public.messages;
create trigger messages_update_conversation_count_after_insert
after insert on public.messages
for each row
execute function public.update_conversation_message_count();

drop trigger if exists messages_update_conversation_count_after_delete on public.messages;
create trigger messages_update_conversation_count_after_delete
after delete on public.messages
for each row
execute function public.update_conversation_message_count();

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists conversations_select_own on public.conversations;
create policy conversations_select_own
on public.conversations
for select
using (auth.uid() = user_id);

drop policy if exists conversations_insert_own_private on public.conversations;
create policy conversations_insert_own_private
on public.conversations
for insert
with check (
  auth.uid() = user_id
  and visibility = 'private'
);

drop policy if exists conversations_update_own on public.conversations;
create policy conversations_update_own
on public.conversations
for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and visibility = 'private'
);

drop policy if exists conversations_delete_own on public.conversations;
create policy conversations_delete_own
on public.conversations
for delete
using (auth.uid() = user_id);

drop policy if exists messages_select_own on public.messages;
create policy messages_select_own
on public.messages
for select
using (auth.uid() = user_id);

drop policy if exists messages_insert_own_conversation on public.messages;
create policy messages_insert_own_conversation
on public.messages
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.conversations c
    where c.id = conversation_id
      and c.user_id = auth.uid()
  )
);

drop policy if exists messages_update_own_conversation on public.messages;
create policy messages_update_own_conversation
on public.messages
for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.conversations c
    where c.id = conversation_id
      and c.user_id = auth.uid()
  )
);

drop policy if exists messages_delete_own on public.messages;
create policy messages_delete_own
on public.messages
for delete
using (auth.uid() = user_id);
