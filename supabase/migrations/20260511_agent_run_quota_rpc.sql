create or replace function public.consume_agent_run_quota(
  p_user_id uuid,
  p_run_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  ok boolean,
  status text,
  quota_limit integer,
  quota_used integer,
  quota_remaining integer,
  usage_id uuid,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_period_start timestamptz := date_trunc('month', now());
  v_period_end timestamptz := date_trunc('month', now()) + interval '1 month';
  v_quota_limit integer;
  v_quota_used integer;
  v_usage_id uuid;
begin
  select role
  into v_role
  from public.profiles
  where id = p_user_id;

  if v_role is null then
    return query
    select false, 'forbidden', null::integer, null::integer, null::integer, null::uuid, '当前用户没有真实 Agent 使用权限。';
    return;
  end if;

  if v_role = 'admin' then
    insert into public.agent_run_usage (
      user_id,
      run_id,
      quota_type,
      status,
      metadata
    )
    values (
      p_user_id,
      nullif(trim(p_run_id), ''),
      'agent_run',
      'started',
      coalesce(p_metadata, '{}'::jsonb)
    )
    returning id into v_usage_id;

    return query
    select true, 'allowed', null::integer, null::integer, null::integer, v_usage_id, 'Admin 用户可使用真实 Agent。';
    return;
  end if;

  if v_role <> 'demo_user' then
    return query
    select false, 'forbidden', null::integer, null::integer, null::integer, null::uuid, '当前用户没有真实 Agent 使用权限。';
    return;
  end if;

  insert into public.agent_run_quota (
    user_id,
    quota_type,
    quota_limit,
    quota_used,
    period_start,
    period_end
  )
  values (
    p_user_id,
    'agent_run',
    20,
    0,
    v_period_start,
    v_period_end
  )
  on conflict (user_id, quota_type, period_start) do nothing;

  with updated_quota as (
    update public.agent_run_quota
    set
      quota_used = quota_used + 1,
      updated_at = now()
    where
      user_id = p_user_id
      and quota_type = 'agent_run'
      and period_start = v_period_start
      and quota_used < quota_limit
    returning agent_run_quota.quota_limit, agent_run_quota.quota_used
  )
  select updated_quota.quota_limit, updated_quota.quota_used
  into v_quota_limit, v_quota_used
  from updated_quota;

  if v_quota_limit is null then
    select q.quota_limit, q.quota_used
    into v_quota_limit, v_quota_used
    from public.agent_run_quota q
    where
      q.user_id = p_user_id
      and q.quota_type = 'agent_run'
      and q.period_start = v_period_start;

    return query
    select
      false,
      'quota_exceeded',
      v_quota_limit,
      v_quota_used,
      greatest(coalesce(v_quota_limit, 0) - coalesce(v_quota_used, 0), 0),
      null::uuid,
      '本月真实 Agent Run 额度已用完，可继续使用公开演示模式。';
    return;
  end if;

  insert into public.agent_run_usage (
    user_id,
    run_id,
    quota_type,
    status,
    metadata
  )
  values (
    p_user_id,
    nullif(trim(p_run_id), ''),
    'agent_run',
    'started',
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_usage_id;

  return query
  select
    true,
    'allowed',
    v_quota_limit,
    v_quota_used,
    greatest(v_quota_limit - v_quota_used, 0),
    v_usage_id,
    '真实 Agent Run 已开始。';
end;
$$;

create or replace function public.finish_agent_run_usage(
  p_usage_id uuid,
  p_status text,
  p_error_code text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  ok boolean,
  status text,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usage_id uuid;
begin
  if p_status not in ('completed', 'failed', 'stopped') then
    return query
    select false, 'invalid_status', 'usage 状态无效。';
    return;
  end if;

  update public.agent_run_usage
  set
    status = p_status,
    finished_at = now(),
    error_code = p_error_code,
    metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb)
  where id = p_usage_id
  returning id into v_usage_id;

  if v_usage_id is null then
    return query
    select false, 'not_found', '未找到 Agent Run usage 记录。';
    return;
  end if;

  return query
  select true, p_status, 'Agent Run usage 已更新。';
end;
$$;

revoke all on function public.consume_agent_run_quota(uuid, text, jsonb) from public;
revoke all on function public.finish_agent_run_usage(uuid, text, text, jsonb) from public;
grant execute on function public.consume_agent_run_quota(uuid, text, jsonb) to service_role;
grant execute on function public.finish_agent_run_usage(uuid, text, text, jsonb) to service_role;
