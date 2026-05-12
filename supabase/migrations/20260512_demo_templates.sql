create extension if not exists pgcrypto with schema extensions;

create table if not exists public.demo_task_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  prompt text not null,
  category text not null,
  recommended_mode text not null default 'mock',
  sort_order integer not null default 0,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint demo_task_templates_category_check check (
    category in ('intro', 'analysis', 'report', 'rag', 'long_context', 'fallback')
  ),
  constraint demo_task_templates_recommended_mode_check check (recommended_mode in ('mock', 'agent'))
);

create table if not exists public.demo_conversation_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  category text not null,
  visibility text not null default 'demo',
  seed_messages jsonb not null default '[]'::jsonb,
  seed_runs jsonb not null default '[]'::jsonb,
  seed_reports jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint demo_conversation_templates_category_check check (
    category in ('intro', 'analysis', 'report', 'rag', 'long_context', 'fallback')
  ),
  constraint demo_conversation_templates_visibility_check check (visibility in ('demo', 'system'))
);

create index if not exists demo_task_templates_enabled_sort_idx
  on public.demo_task_templates (is_enabled, sort_order);

create index if not exists demo_task_templates_category_sort_idx
  on public.demo_task_templates (category, sort_order);

create index if not exists demo_conversation_templates_enabled_sort_idx
  on public.demo_conversation_templates (is_enabled, sort_order);

create index if not exists demo_conversation_templates_category_sort_idx
  on public.demo_conversation_templates (category, sort_order);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists demo_task_templates_set_updated_at on public.demo_task_templates;
create trigger demo_task_templates_set_updated_at
before update on public.demo_task_templates
for each row
execute function public.set_updated_at();

drop trigger if exists demo_conversation_templates_set_updated_at on public.demo_conversation_templates;
create trigger demo_conversation_templates_set_updated_at
before update on public.demo_conversation_templates
for each row
execute function public.set_updated_at();

alter table public.demo_task_templates enable row level security;
alter table public.demo_conversation_templates enable row level security;

drop policy if exists demo_task_templates_select_enabled on public.demo_task_templates;
create policy demo_task_templates_select_enabled
on public.demo_task_templates
for select
using (is_enabled = true);

drop policy if exists demo_conversation_templates_select_enabled on public.demo_conversation_templates;
create policy demo_conversation_templates_select_enabled
on public.demo_conversation_templates
for select
using (is_enabled = true and visibility in ('demo', 'system'));

grant select on public.demo_task_templates to anon, authenticated;
grant select on public.demo_conversation_templates to anon, authenticated;

insert into public.demo_task_templates (
  id,
  title,
  description,
  prompt,
  category,
  recommended_mode,
  sort_order,
  is_enabled,
  metadata
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '你能做什么？',
    '了解工作台如何组合教育数据分析、工具调用、报告生成和知识检索能力。',
    '你能做什么？请用工作台视角说明你可以如何帮助我完成教育数据分析、报告生成和知识检索。',
    'intro',
    'mock',
    10,
    true,
    '{"showcaseValue":"能力介绍 / 入口引导","tags":["能力介绍","工作台入口","公开演示"]}'::jsonb
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '分析 2026 年 5 月教学质量数据，找出异常指标',
    '定位本月教学质量异常指标、异常班级和可能原因，输出管理建议。',
    '分析 2026 年 5 月教学质量数据，找出异常指标、异常班级和可能原因，并给出管理建议。',
    'analysis',
    'agent',
    20,
    true,
    '{"showcaseValue":"数据分析 / 异常定位 / 图表生成","tags":["异常定位","教学质量","图表生成"]}'::jsonb
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    '对比本月和上月教学质量指标变化',
    '对比 2026 年 5 月与 4 月关键指标变化，识别改善项和下降项。',
    '对比 2026 年 5 月和 4 月的教学质量指标变化，说明哪些指标改善、哪些指标下降。',
    'analysis',
    'agent',
    30,
    true,
    '{"showcaseValue":"月度对比 / 变化解释 / 管理关注项","tags":["月度对比","指标变化","管理建议"]}'::jsonb
  ),
  (
    '10000000-0000-4000-8000-000000000004',
    '分析最近 6 个月教学质量趋势',
    '观察长期趋势，识别持续改善和持续下滑的指标。',
    '分析最近 6 个月教学质量趋势，指出持续改善和持续下滑的指标。',
    'analysis',
    'agent',
    40,
    true,
    '{"showcaseValue":"趋势分析 / 长周期指标 / 风险预警","tags":["趋势分析","长周期","风险预警"]}'::jsonb
  ),
  (
    '10000000-0000-4000-8000-000000000005',
    '生成一份简版教学质量报告',
    '面向教务管理者生成简版教学质量分析报告。',
    '基于本月教学质量数据，生成一份面向教务管理者的简版分析报告。',
    'report',
    'mock',
    50,
    true,
    '{"showcaseValue":"报告生成 / 管理摘要 / 行动建议","tags":["报告生成","Markdown","管理摘要"]}'::jsonb
  ),
  (
    '10000000-0000-4000-8000-000000000006',
    '超长上下文数据分析示例',
    '打开长会话模板，展示多轮追问、大文本结果和性能保护边界。',
    '打开一个超长上下文数据分析示例，展示长会话、多轮追问和大文本结果的处理方式。',
    'long_context',
    'mock',
    60,
    true,
    '{"showcaseValue":"长上下文 / 多轮分析 / 性能保护","tags":["长上下文","多轮追问","懒加载"],"templateKey":"long_context_quality","performanceNotes":"不是通过一次性渲染超大 DOM 展示长会话能力，而是后续通过分页、折叠、懒加载实现。"}'::jsonb
  ),
  (
    '10000000-0000-4000-8000-000000000007',
    '教学评价政策 RAG 检索示例',
    '打开政策依据模板，展示 RAG 来源引用和证据链入口。',
    '根据教学评价制度，说明为什么要关注课堂参与度、作业完成率和学业预警，并给出依据来源。',
    'rag',
    'mock',
    70,
    true,
    '{"showcaseValue":"RAG 来源引用 / 政策依据 / 证据链","tags":["RAG","政策依据","引用"],"templateKey":"policy_rag_demo","ragNote":"当前是 RAG 模板示例，真实 RAG 检索将在 Step 59 接入。"}'::jsonb
  ),
  (
    '10000000-0000-4000-8000-000000000008',
    '数据源异常与兜底示例',
    '打开工具失败和数据源异常模板，展示错误态、兜底和上下文保留。',
    '如果数据源暂不可用，系统应该如何提示用户，并如何保留当前分析上下文？',
    'fallback',
    'mock',
    80,
    true,
    '{"showcaseValue":"错误态 / 兜底 / 不自动重放 Mock","tags":["错误态","兜底","上下文保留"],"templateKey":"datasource_fallback"}'::jsonb
  )
on conflict (id) do update
set
  title = excluded.title,
  description = excluded.description,
  prompt = excluded.prompt,
  category = excluded.category,
  recommended_mode = excluded.recommended_mode,
  sort_order = excluded.sort_order,
  is_enabled = excluded.is_enabled,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.demo_conversation_templates (
  id,
  title,
  description,
  category,
  visibility,
  seed_messages,
  seed_runs,
  seed_reports,
  sort_order,
  is_enabled,
  metadata
)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '超长教学质量数据分析示例',
    '展示长会话、多轮追问和大文本结果的处理方式，正式长会话能力应通过分页、折叠和懒加载实现。',
    'long_context',
    'demo',
    $json$[
      {"role":"user","kind":"text","content":"请基于近 6 个月教学质量数据，先总结整体趋势，再标出需要进一步追问的异常项。","status":"completed"},
      {"role":"assistant","kind":"text","content":"整体看，平均分保持小幅上升，但八年级出勤率连续两个月低于基线，七年级作业完成率波动较大。建议后续优先追问八年级出勤和七年级作业完成情况。","status":"completed"},
      {"role":"user","kind":"text","content":"继续展开八年级出勤率下降的可能原因，并说明需要补充哪些数据。","status":"completed"},
      {"role":"assistant","kind":"text","content":"可能原因包括班级活动冲突、个别班级请假集中、统计口径变化或数据同步延迟。建议补充班级维度出勤明细、请假类型、周次分布和班主任备注。","status":"completed"}
    ]$json$::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    10,
    true,
    '{"templateKey":"long_context_quality","showcase":"long_context","messageCountHint":120,"performanceNotes":"正式长会话展示应通过分页、折叠和 lazy render，不一次性渲染超大 DOM。"}'::jsonb
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '多轮追问生成报告示例',
    '展示从异常定位到原因追问，再到管理报告生成的多轮工作流。',
    'report',
    'demo',
    $json$[
      {"role":"user","kind":"text","content":"分析本月教学质量数据，先找出异常指标。","status":"completed"},
      {"role":"assistant","kind":"text","content":"本月主要异常集中在七年级平均分下降、八年级出勤率波动、九年级作业完成率低于目标线。建议优先核查七年级数学与八年级重点班级。","status":"completed"},
      {"role":"user","kind":"text","content":"请把这些发现整理成给教务管理者看的简版报告。","status":"completed"},
      {"role":"assistant","kind":"report","content":"# 教学质量简版报告\n\n## 主要结论\n本月教学质量整体稳定，但七年级平均分和八年级出勤率存在异常波动。\n\n## 建议\n1. 核查七年级数学周测明细。\n2. 跟进八年级班级出勤记录。\n3. 将作业完成率纳入下月重点跟踪。","status":"completed"}
    ]$json$::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    20,
    true,
    '{"templateKey":"report_followup","showcase":"multi_turn_report","tags":["多轮追问","报告生成","管理摘要"]}'::jsonb
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    '教学评价政策 RAG 检索示例',
    '展示政策依据、来源引用和右侧来源面板的目标体验；真实检索将在后续 Step 59 接入。',
    'rag',
    'demo',
    $json$[
      {"role":"user","kind":"text","content":"根据教学评价制度，为什么要同时关注课堂参与度、作业完成率和学业预警？请给出依据来源。","status":"completed"},
      {"role":"assistant","kind":"text","content":"根据示例政策片段，课堂参与度可反映过程性学习状态，作业完成率用于识别持续投入不足，学业预警用于提前发现风险学生。回答中应引用来源，例如 [S1] 评价指标口径、[S2] 学业预警规则。真实 RAG 检索将在后续接入。","status":"completed"},
      {"role":"user","kind":"text","content":"如果只能优先看两个指标，应该怎么选？","status":"completed"},
      {"role":"assistant","kind":"text","content":"建议优先看作业完成率和学业预警：前者反映过程投入，后者反映结果风险。课堂参与度适合作为解释性辅助指标。","status":"completed"}
    ]$json$::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    30,
    true,
    '{"templateKey":"policy_rag_demo","showcase":"rag","ragNote":"当前是 RAG 模板示例，真实 RAG 检索将在 Step 59 接入。","tags":["RAG","引用","政策依据"]}'::jsonb
  ),
  (
    '20000000-0000-4000-8000-000000000004',
    '数据源异常兜底示例',
    '展示数据源不可用、工具失败和保留上下文的兜底体验。',
    'fallback',
    'demo',
    $json$[
      {"role":"user","kind":"text","content":"如果数据源暂不可用，系统应该如何提示用户，并如何保留当前分析上下文？","status":"completed"},
      {"role":"assistant","kind":"text","content":"系统应明确说明数据源暂不可用，不应伪造查询结果；同时保留当前问题、已完成步骤和可重试入口。用户可以切换公开演示模式继续了解流程，但不应自动把失败请求重放为 Mock。","status":"completed"},
      {"role":"user","kind":"text","content":"那对教务管理者应该怎么表达？","status":"completed"},
      {"role":"assistant","kind":"text","content":"建议表达为：当前数据源连接暂不可用，本次分析上下文已保留。请稍后重试或联系管理员检查数据源配置；在此期间可查看历史报告或公开演示流程。","status":"completed"}
    ]$json$::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    40,
    true,
    '{"templateKey":"datasource_fallback","showcase":"fallback","tags":["错误态","兜底","上下文保留"]}'::jsonb
  )
on conflict (id) do update
set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  visibility = excluded.visibility,
  seed_messages = excluded.seed_messages,
  seed_runs = excluded.seed_runs,
  seed_reports = excluded.seed_reports,
  sort_order = excluded.sort_order,
  is_enabled = excluded.is_enabled,
  metadata = excluded.metadata,
  updated_at = now();
