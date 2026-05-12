create extension if not exists pgcrypto with schema extensions;

create table if not exists public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  visibility text not null default 'demo',
  name text not null,
  type text not null default 'policy',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint knowledge_sources_visibility_check check (visibility in ('private', 'demo', 'system')),
  constraint knowledge_sources_type_check check (type in ('policy', 'faq', 'guide', 'dataset_doc')),
  constraint knowledge_sources_status_check check (status in ('active', 'disabled', 'archived')),
  constraint knowledge_sources_private_owner_check check (visibility <> 'private' or user_id is not null)
);

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.knowledge_sources(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  visibility text not null default 'demo',
  title text not null,
  uri text,
  mime_type text not null default 'text/plain',
  status text not null default 'active',
  content_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint knowledge_documents_visibility_check check (visibility in ('private', 'demo', 'system')),
  constraint knowledge_documents_status_check check (status in ('active', 'disabled', 'archived')),
  constraint knowledge_documents_private_owner_check check (visibility <> 'private' or user_id is not null)
);

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  source_id uuid not null references public.knowledge_sources(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  visibility text not null default 'demo',
  chunk_index integer not null,
  content text not null,
  content_tsv tsvector,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint knowledge_chunks_visibility_check check (visibility in ('private', 'demo', 'system')),
  constraint knowledge_chunks_chunk_index_check check (chunk_index >= 0),
  constraint knowledge_chunks_private_owner_check check (visibility <> 'private' or user_id is not null)
);

create table if not exists public.rag_retrieval_logs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.agent_runs(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null,
  top_k integer not null default 5,
  results jsonb not null default '[]'::jsonb,
  latency_ms integer,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint rag_retrieval_logs_top_k_check check (top_k > 0),
  constraint rag_retrieval_logs_latency_ms_check check (latency_ms is null or latency_ms >= 0)
);

create index if not exists knowledge_sources_visibility_status_idx
  on public.knowledge_sources (visibility, status);

create index if not exists knowledge_sources_user_idx
  on public.knowledge_sources (user_id);

create index if not exists knowledge_documents_source_idx
  on public.knowledge_documents (source_id);

create index if not exists knowledge_documents_visibility_status_idx
  on public.knowledge_documents (visibility, status);

create index if not exists knowledge_documents_user_idx
  on public.knowledge_documents (user_id);

create index if not exists knowledge_chunks_source_chunk_idx
  on public.knowledge_chunks (source_id, chunk_index);

create index if not exists knowledge_chunks_document_chunk_idx
  on public.knowledge_chunks (document_id, chunk_index);

create index if not exists knowledge_chunks_visibility_idx
  on public.knowledge_chunks (visibility);

create index if not exists knowledge_chunks_content_tsv_idx
  on public.knowledge_chunks using gin (content_tsv);

create index if not exists rag_retrieval_logs_run_created_idx
  on public.rag_retrieval_logs (run_id, created_at desc);

create index if not exists rag_retrieval_logs_conversation_created_idx
  on public.rag_retrieval_logs (conversation_id, created_at desc);

create index if not exists rag_retrieval_logs_user_created_idx
  on public.rag_retrieval_logs (user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists knowledge_sources_set_updated_at on public.knowledge_sources;
create trigger knowledge_sources_set_updated_at
before update on public.knowledge_sources
for each row
execute function public.set_updated_at();

drop trigger if exists knowledge_documents_set_updated_at on public.knowledge_documents;
create trigger knowledge_documents_set_updated_at
before update on public.knowledge_documents
for each row
execute function public.set_updated_at();

create or replace function public.set_knowledge_chunk_tsv()
returns trigger
language plpgsql
as $$
begin
  new.content_tsv = to_tsvector('simple', coalesce(new.content, ''));
  return new;
end;
$$;

drop trigger if exists knowledge_chunks_set_tsv on public.knowledge_chunks;
create trigger knowledge_chunks_set_tsv
before insert or update of content on public.knowledge_chunks
for each row
execute function public.set_knowledge_chunk_tsv();

alter table public.knowledge_sources enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.rag_retrieval_logs enable row level security;

drop policy if exists knowledge_sources_select_visible on public.knowledge_sources;
create policy knowledge_sources_select_visible
on public.knowledge_sources
for select
using (
  visibility in ('demo', 'system')
  or (visibility = 'private' and user_id = auth.uid())
);

drop policy if exists knowledge_documents_select_visible on public.knowledge_documents;
create policy knowledge_documents_select_visible
on public.knowledge_documents
for select
using (
  visibility in ('demo', 'system')
  or (visibility = 'private' and user_id = auth.uid())
);

drop policy if exists knowledge_chunks_select_visible on public.knowledge_chunks;
create policy knowledge_chunks_select_visible
on public.knowledge_chunks
for select
using (
  visibility in ('demo', 'system')
  or (visibility = 'private' and user_id = auth.uid())
);

drop policy if exists rag_retrieval_logs_select_own on public.rag_retrieval_logs;
create policy rag_retrieval_logs_select_own
on public.rag_retrieval_logs
for select
using (user_id = auth.uid());

insert into public.knowledge_sources (
  id,
  visibility,
  name,
  type,
  status,
  metadata
)
values (
  '59000000-0000-4000-8000-000000000001',
  'demo',
  '教学评价制度示例知识库',
  'policy',
  'active',
  '{"scope":"demo","description":"用于演示教学评价制度、学业预警和数据异常处理的最小知识库。"}'::jsonb
)
on conflict (id) do update
set
  visibility = excluded.visibility,
  name = excluded.name,
  type = excluded.type,
  status = excluded.status,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.knowledge_documents (
  id,
  source_id,
  visibility,
  title,
  uri,
  mime_type,
  status,
  content_text,
  metadata
)
values
  (
    '59000000-0000-4000-8000-000000000101',
    '59000000-0000-4000-8000-000000000001',
    'demo',
    '教学质量评价指标口径',
    'demo://teaching-quality-metrics',
    'text/plain',
    'active',
    '课堂参与度、出勤率、作业完成率和阶段测评结果共同构成教学质量过程性评价的基础。',
    '{"version":"2026-05-demo","category":"policy"}'::jsonb
  ),
  (
    '59000000-0000-4000-8000-000000000102',
    '59000000-0000-4000-8000-000000000001',
    'demo',
    '学业预警与过程性评价规则',
    'demo://academic-warning-process-evaluation',
    'text/plain',
    'active',
    '学业预警应综合成绩波动、出勤异常、作业完成率下降和教师备注，避免只依据单次考试结果下结论。',
    '{"version":"2026-05-demo","category":"policy"}'::jsonb
  ),
  (
    '59000000-0000-4000-8000-000000000103',
    '59000000-0000-4000-8000-000000000001',
    'demo',
    '数据异常与分析报告说明',
    'demo://data-exception-reporting',
    'text/plain',
    'active',
    '数据源暂不可用或字段缺失时，系统不得伪造分析结果，应保留上下文并提供重试或公开演示路径。',
    '{"version":"2026-05-demo","category":"fallback"}'::jsonb
  )
on conflict (id) do update
set
  source_id = excluded.source_id,
  visibility = excluded.visibility,
  title = excluded.title,
  uri = excluded.uri,
  mime_type = excluded.mime_type,
  status = excluded.status,
  content_text = excluded.content_text,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.knowledge_chunks (
  id,
  document_id,
  source_id,
  visibility,
  chunk_index,
  content,
  content_tsv,
  metadata
)
values
  (
    '59000000-0000-4000-8000-000000001001',
    '59000000-0000-4000-8000-000000000101',
    '59000000-0000-4000-8000-000000000001',
    'demo',
    0,
    '课堂参与度用于观察学生在课堂互动、提问、讨论和任务参与中的过程性表现，不能单独作为最终评价结论，应结合出勤率、作业完成率和阶段测评结果综合判断。',
    to_tsvector('simple', '课堂参与度用于观察学生在课堂互动、提问、讨论和任务参与中的过程性表现，不能单独作为最终评价结论，应结合出勤率、作业完成率和阶段测评结果综合判断。'),
    '{"citationTopic":"课堂参与度"}'::jsonb
  ),
  (
    '59000000-0000-4000-8000-000000001002',
    '59000000-0000-4000-8000-000000000101',
    '59000000-0000-4000-8000-000000000001',
    'demo',
    1,
    '作业完成率用于识别学习投入不足和持续性风险。连续两周低于年级基线的班级或学生，应进入教学关注名单，并结合课堂参与和阶段测评结果判断是否需要干预。',
    to_tsvector('simple', '作业完成率用于识别学习投入不足和持续性风险。连续两周低于年级基线的班级或学生，应进入教学关注名单，并结合课堂参与和阶段测评结果判断是否需要干预。'),
    '{"citationTopic":"作业完成率"}'::jsonb
  ),
  (
    '59000000-0000-4000-8000-000000001003',
    '59000000-0000-4000-8000-000000000101',
    '59000000-0000-4000-8000-000000000001',
    'demo',
    2,
    '出勤率是教学质量分析中的基础过程指标。出勤率异常下降时，应优先核验班级、学科和时间段，并结合教师备注判断是否为临时事件或持续风险。',
    to_tsvector('simple', '出勤率是教学质量分析中的基础过程指标。出勤率异常下降时，应优先核验班级、学科和时间段，并结合教师备注判断是否为临时事件或持续风险。'),
    '{"citationTopic":"出勤率"}'::jsonb
  ),
  (
    '59000000-0000-4000-8000-000000001004',
    '59000000-0000-4000-8000-000000000102',
    '59000000-0000-4000-8000-000000000001',
    'demo',
    0,
    '学业预警应结合成绩波动、出勤异常、作业完成率下降和教师备注进行综合判断，避免仅依据单次考试结果下结论。',
    to_tsvector('simple', '学业预警应结合成绩波动、出勤异常、作业完成率下降和教师备注进行综合判断，避免仅依据单次考试结果下结论。'),
    '{"citationTopic":"学业预警"}'::jsonb
  ),
  (
    '59000000-0000-4000-8000-000000001005',
    '59000000-0000-4000-8000-000000000102',
    '59000000-0000-4000-8000-000000000001',
    'demo',
    1,
    '过程性评价强调持续观察，不建议将课堂参与度、作业完成率或单次测评结果作为孤立结论。需要结合趋势、班级基线和学科特点形成管理建议。',
    to_tsvector('simple', '过程性评价强调持续观察，不建议将课堂参与度、作业完成率或单次测评结果作为孤立结论。需要结合趋势、班级基线和学科特点形成管理建议。'),
    '{"citationTopic":"过程性评价"}'::jsonb
  ),
  (
    '59000000-0000-4000-8000-000000001006',
    '59000000-0000-4000-8000-000000000102',
    '59000000-0000-4000-8000-000000000001',
    'demo',
    2,
    '当多个过程指标同时下滑时，应优先识别是否存在教学节奏变化、评价口径调整或数据采集延迟，必要时由教务管理者发起复核。',
    to_tsvector('simple', '当多个过程指标同时下滑时，应优先识别是否存在教学节奏变化、评价口径调整或数据采集延迟，必要时由教务管理者发起复核。'),
    '{"citationTopic":"复核规则"}'::jsonb
  ),
  (
    '59000000-0000-4000-8000-000000001007',
    '59000000-0000-4000-8000-000000000103',
    '59000000-0000-4000-8000-000000000001',
    'demo',
    0,
    '数据源暂不可用时，系统不得伪造分析结果，应明确提示数据源状态，保留当前分析上下文，并提供重试或公开演示路径。',
    to_tsvector('simple', '数据源暂不可用时，系统不得伪造分析结果，应明确提示数据源状态，保留当前分析上下文，并提供重试或公开演示路径。'),
    '{"citationTopic":"数据源不可用"}'::jsonb
  ),
  (
    '59000000-0000-4000-8000-000000001008',
    '59000000-0000-4000-8000-000000000103',
    '59000000-0000-4000-8000-000000000001',
    'demo',
    1,
    '报告生成应说明分析依据、数据范围和限制条件。若存在字段缺失、样本不足或口径不一致，应在报告中明确标注，不应输出确定性结论。',
    to_tsvector('simple', '报告生成应说明分析依据、数据范围和限制条件。若存在字段缺失、样本不足或口径不一致，应在报告中明确标注，不应输出确定性结论。'),
    '{"citationTopic":"报告限制说明"}'::jsonb
  )
on conflict (id) do update
set
  document_id = excluded.document_id,
  source_id = excluded.source_id,
  visibility = excluded.visibility,
  chunk_index = excluded.chunk_index,
  content = excluded.content,
  content_tsv = excluded.content_tsv,
  metadata = excluded.metadata;
