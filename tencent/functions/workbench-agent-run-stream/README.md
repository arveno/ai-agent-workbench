# workbench-agent-run-stream

CloudBase HTTP Function for the current Agent Run stream path.

This function owns the authenticated Agent Run SSE entry. The current main path creates the canonical run, consumes quota, enters LangGraph runtime, executes LangChain Tool / Structured Tool and LangChain Retriever / Document boundaries, persists canonical `run_events`, `tool_invocations`, `retrieval_logs`, `run_sources`, assistant message metadata, and records LangSmith trace status as external observability metadata.

The canonical `runId` remains `agent_runs.id`. LangGraph checkpoint/thread ids and LangSmith trace/run ids are metadata only and never replace `runId`, message/report/source/usage/evaluation foreign keys, or project persistence facts.

Report generation remains a separate artifact API; this function only owns Agent Run streaming and persistence.

## Route

Configure one fixed CloudBase HTTP route:

```txt
/api/agent/run/stream -> workbench-agent-run-stream
Identity authentication: enabled
Path passthrough: disabled
```

Without a token, the request should be rejected by the CloudBase gateway before it reaches the function.

## Request

```txt
POST /api/agent/run/stream
Content-Type: application/json
Authorization: Bearer <cloudbase-token>
```

Body:

```json
{
  "prompt": "分析本月教学质量数据，找出异常指标",
  "conversationId": "current-private-conversation-id",
  "clientRunId": "optional-client-run-id",
  "selectedModelId": "siliconflow-qwen-free"
}
```

Fields:

- `conversationId` is required.
- `prompt` is optional; the function uses a teaching-data analysis prompt when omitted.
- `clientRunId` is optional; the function generates one when omitted.
- `selectedModelId` is optional; the service resolves it through the server-side model catalog.
- `mode` is not a runtime switch. The public entry always uses the current Agent Run path.
- `provider` is ignored. Data tools read CloudBase MySQL through server-side allowlists.

The function reuses `_shared/auth.js` to get `currentUser`, then checks:

```txt
conversations.id = conversationId
_openid = currentUser.openid
user_id = currentUser.userId
visibility = private
```

## Current Agent Run Path

The current path is:

1. Authenticate request and resolve `currentUser`.
2. Read and validate `conversationId`.
3. Check idempotency by `user_id + clientRunId` when `clientRunId` is provided. Existing runs return a `run_reused` SSE event and do not consume quota or write trace rows again.
4. Insert `agent_runs(status = pending)` first. Migration `007_agent_runs_client_run_id.sql` adds the hard unique boundary on `(user_id, client_run_id)`, so concurrent duplicate requests are rejected before quota is consumed.
5. Consume one Agent Run quota with a compare-and-set update and create `agent_run_usage(status = started)`.
6. Attach `usage_id` to the pending run, mark it `running`, and update the conversation latest run.
7. Start LangSmith trace when server-side LangSmith config is available; otherwise record explicit not-configured / failed status.
8. Enter LangGraph runtime and map graph node progress to canonical SSE / Run Trace events.
9. For `data_analysis`, execute the controlled LangChain Tool chain:
   - `schema_inspect`
   - `aggregate_table`
   - `chart_render`
10. For `knowledge_qa`, execute `knowledge_search` through LangChain Retriever / Document against CloudBase MySQL `knowledge_documents` / `knowledge_chunks`.
11. Persist `tool_invocations` with `tool_name`, `status`, `input`, `output`, `elapsed_ms`, and metadata.
12. Use `_shared/langchainModelLayer.js` to generate the conclusion when a model provider is configured.
13. Fall back explicitly when the model provider is not configured, MySQL tables are missing, queries fail, no rows are returned, no knowledge chunks match, or the model provider fails.
14. Insert one assistant `messages` row with source metadata, skipping insert when the same `run_id` already has an assistant message.
15. Mark `agent_runs(status = completed)`.
16. Stream `run_completed`.
17. Finish quota usage with `status = completed`.

If the client disconnects, the function stops writing later SSE events, marks the run as `stopped` where possible, and tries to finish usage as `stopped`. If another error occurs after quota consumption, it tries to finish usage as `failed`.

## Idempotency And Quota

Tencent-24 adds service-side idempotency for `POST /api/agent/run/stream`:

- `user_id + clientRunId` is the idempotency key when `clientRunId` is provided.
- A duplicate request that finds an existing `agent_runs.client_run_id` for the current user returns `run_reused` over SSE and does not consume quota, create another run, write another assistant message, or replay `run_events` / `tool_invocations`.
- Migration `007_agent_runs_client_run_id.sql` must be executed before deploying this function. It adds `UNIQUE KEY uk_agent_runs_user_client_run (user_id, client_run_id)` and prevents two CloudBase function instances from creating duplicate runs for the same user and `clientRunId`.
- The function inserts a pending run before quota consumption. If the insert hits the unique key, it queries the existing run and returns `run_reused` instead of treating the duplicate as a 500.
- A same-process in-flight guard reduces duplicate work from double clicks and local retries before the first run row is visible.
- If `clientRunId` is missing, the function still runs with a generated id and records `clientRunIdMissing = true` in run metadata, but full idempotency is not possible.

CloudBase MySQL `rdb()` documentation currently exposes filters and counted updates, but this function does not use a MySQL transaction / `SELECT ... FOR UPDATE` because no stable `rdb()` transaction or raw SQL API is used here. Quota consume therefore uses a compare-and-set update:

```txt
UPDATE agent_run_quota
SET quota_used = oldQuotaUsed + 1
WHERE id = quotaId
  AND _openid = currentUser.openid
  AND user_id = currentUser.userId
  AND quota_used = oldQuotaUsed
```

The update is requested with `count = "exact"` and retried on compare failure. `admin` users still write `agent_run_usage` without increasing `quota_used`.

If quota consumption fails after the pending run is inserted, the function keeps the run row and marks it `failed` with `quota_exceeded` or `quota_consume_failed`. This avoids deleting the idempotency record and gives operators an audit trail; no usage row or assistant message is written in that case.

## Mock / Real / Fallback Boundary

- Mock data belongs to frontend demo / seed / explicit validation paths only. This function does not expose a long-lived `basic` mock runtime switch.
- Real Agent Run enters LangGraph runtime and executes LangChain Tool / Retriever boundaries. It never lets a model execute SQL directly.
- `schema_inspect` returns a fixed schema description for `teaching_metrics`.
- `aggregate_table` reads `teaching_metrics` through CloudBase MySQL and aggregates in JavaScript by month, grade, or subject.
- `chart_render` converts aggregate results into chart config and series data; it does not render an image.
- `conclusionSource = "model"` means `_shared/langchainModelLayer.js` generated the final conclusion through the selected catalog model.
- `conclusionSource = "fallback"` means the final conclusion was generated locally, and `fallbackReason` explains why.
- `conclusionSource = "mock"` is reserved for explicit mock/demo data and must not be emitted as a real provider result.
- `knowledge_qa` runs the controlled `knowledge_search` tool through LangChain Retriever / Document against CloudBase MySQL `knowledge_documents` / `knowledge_chunks`.
- `runId` / `agent_runs.id` is the only business run relationship. `clientRunId` / `agent_runs.client_run_id` is used for frontend pending state, idempotency, duplicate request handling, and request tracing.
- `tool_invocations` remains the Tool Invocation fact source.
- `retrieval_logs` / `run_sources` remain the Source Lineage fact sources.
- LangSmith trace / run ids are external observability ids in metadata only.

## Environment Variables

Do not hard-code keys or connection strings in source code.

The LangChain Model Layer reads the selected model from `selectedModelId`, checks it against the server-side catalog whitelist, and maps it to SiliconFlow / Zhipu OpenAI-compatible API settings. Required provider keys:

```txt
SILICONFLOW_API_KEY=...
ZHIPU_API_KEY=...
```

Optional endpoint / model / timeout overrides:

```txt
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
ZHIPU_BASE_URL=https://open.bigmodel.cn/api/paas/v4
SILICONFLOW_MODEL_QWEN=Qwen/Qwen2.5-7B-Instruct
SILICONFLOW_MODEL_GLM=THUDM/GLM-4-9B-0414
ZHIPU_MODEL_GLM_FLASH=glm-4-flash-250414
MODEL_GATEWAY_TIMEOUT_MS=30000
LANGSMITH_API_KEY=...
LANGSMITH_PROJECT=ai-agent-workbench
LANGSMITH_TIMEOUT_MS=3000
CLOUDBASE_ENV_ID / TCB_ENV_ID Provided by CloudBase runtime or deployment config.
```

Agent Run data tools use CloudBase MySQL through the CloudBase function runtime, `@cloudbase/node-sdk`, and `app.rdb()`.

Model and LangSmith keys must be CloudBase function environment variables only. Do not put `SILICONFLOW_API_KEY`, `ZHIPU_API_KEY`, `LANGSMITH_API_KEY`, or `LANGCHAIN_API_KEY` in EdgeOne / frontend `VITE_*` variables.

When no model provider is configured, the function should still return SSE and complete the run through explicit fallback instead of returning 500. `_shared/langchainModelLayer.js` is the current execution boundary; `MODEL_GATEWAY_TIMEOUT_MS` remains the timeout environment variable name to keep existing server configuration stable.

Fallback reasons used by the real data-analysis path:

- `data_table_not_found`: `teaching_metrics` has not been created.
- `data_tool_query_failed`: CloudBase MySQL query failed.
- `data_empty`: query succeeded but no matching rows were available.
- `model_not_configured`: data tools succeeded but no model provider is configured.
- `model_unauthorized`: provider returned 401 or an invalid API key error.
- `model_forbidden`: provider returned 403 or a forbidden / region / permission response.
- `model_not_found`: configured model does not exist or is not supported.
- `model_rate_limited`: provider returned 429 or a rate-limit response.
- `model_timeout`: model request timed out.
- `model_network_error`: fetch or network transport failed.
- `model_response_parse_failed`: streamed response could not be parsed.
- `model_failed`: other unknown model conclusion generation failure.
- `unknown_tool_error`: controlled tool chain failed for another reason.

Additional fallback reasons used by the controlled knowledge path:

- `rag_table_not_found`: `knowledge_documents` or `knowledge_chunks` has not been created.
- `rag_query_failed`: CloudBase MySQL knowledge query failed.
- `rag_empty`: knowledge tables exist but have no enabled demo/system content.
- `rag_no_match`: query succeeded but no relevant chunks matched the prompt.

Model diagnostics are deliberately redacted. Function logs record only:

```txt
hasModelApiKey
modelApiKeyLength
provider
model
modelHttpStatus
modelErrorType
modelErrorMessage
```

`modelErrorMessage` is truncated to 300 characters. The function does not log raw API keys, full request headers, or connection strings.

## SSE Response

Response headers:

```txt
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
Connection: keep-alive
Access-Control-Allow-Origin: *
```

Each event is written as:

```txt
data: {...}

```

Common event types:

```txt
run_started
step_started
step_completed
tool_started
tool_completed
tool_failed
chart_ready
conclusion_delta
conclusion_completed
report_pending
run_completed
run_failed
```

Example event:

```json
{
  "type": "conclusion_completed",
  "runId": "...",
  "clientRunId": "browser-agent-real-run-...",
  "conversationId": "...",
  "timestamp": "2026-05-15T00:00:00.000Z",
  "conclusionSource": "model",
  "fallbackReason": null,
  "selectedModelId": "siliconflow-qwen-free",
  "provider": "siliconflow",
  "model": "Qwen/Qwen2.5-7B-Instruct",
  "latencyMs": 1280,
  "tokenUsage": {
    "promptTokens": 320,
    "completionTokens": 180,
    "totalTokens": 500
  }
}
```

## Persistence

All private reads and writes include:

```txt
_openid = currentUser.openid
user_id = currentUser.userId
```

JSON fields are written with `JSON.stringify(...)`:

- `agent_run_quota.metadata`
- `agent_run_usage.metadata`
- `agent_runs.plan`
- `agent_runs.data_source_snapshot`
- `agent_runs.chart_data`
- `agent_runs.metadata`
- `run_events.payload`
- `tool_invocations.input`
- `tool_invocations.output`
- `tool_invocations.metadata`
- `messages.metadata`

This function uses CAS-style atomic quota update plus migration `007_agent_runs_client_run_id.sql` for cross-instance Agent Run idempotency. It still does not add a full MySQL transaction or `SELECT ... FOR UPDATE`; before switching public high-concurrency traffic, review quota behavior and consider a transaction, row lock, or stored procedure for the quota counter.

## Package

Upload a source package only. Do not include `node_modules`, and do not submit or upload `package-lock.json`. Enable CloudBase automatic dependency installation.

Use the repo package script:

```bash
pnpm cloudbase:package -- --function workbench-agent-run-stream --out ./.cloudbase-packages --clean --check
```

Zip root must contain:

```txt
_shared/
index.js
package.json
README.md
scf_bootstrap
```

## Verify

Syntax check:

```bash
node --check tencent/functions/_shared/langgraphRuntime.js
node --check tencent/functions/_shared/langsmithObservability.js
node --check tencent/functions/_shared/langchainModelLayer.js
node --check tencent/functions/workbench-agent-run-stream/index.js
```

Online checks after deployment:

```bash
curl -i https://<your-domain>/api/agent/run/stream
curl -N -i -X POST \
  -H "Authorization: Bearer <cloudbase-token>" \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"分析本月教学质量数据，找出异常指标\",\"conversationId\":\"<conversation-id>\",\"clientRunId\":\"manual-langgraph-run\",\"selectedModelId\":\"siliconflow-qwen-free\"}" \
  https://<your-domain>/api/agent/run/stream
```

Expected result:

- Without token: CloudBase gateway returns `401 MISSING_CREDENTIALS`.
- With token but missing or foreign `conversationId`: the function returns `validation_error` or `not_found`.
- Current Agent Run streams LangGraph-backed canonical events, including `schema_inspect` / `aggregate_table` / `chart_render` or `knowledge_search` tool completions where applicable.
- If the model provider succeeds after data tools succeed, the run returns `conclusionSource = "model"` with `selectedModelId`, `provider`, `model`, `tokenUsage`, and `latencyMs`.
- If the model provider fails after data tools succeed, the run returns `conclusionSource = "fallback"` and a specific `fallbackReason`, such as `model_unauthorized`, `model_forbidden`, `model_not_found`, `model_rate_limited`, `model_timeout`, `model_network_error`, `model_response_parse_failed`, or `model_failed`.
- `conclusion_completed` and `run_completed` include `provider`, `model`, `modelErrorType`, `modelHttpStatus`, and redacted `modelErrorMessage` when available; neither event includes raw tokens or request headers.
- LangSmith trace status is explicit in metadata: started, completed, not configured, failed, or timed out.
- `quotaUsed` increases for `demo_user`.
- `messages` contains the assistant message.
- `agent_runs`, `run_events`, `tool_invocations`, and when RAG is used `retrieval_logs` / `run_sources`, contain records for the run.
- Existing `demo-tasks`, `demo-conversations`, `auth-me`, `workbench-conversations`, `workbench-messages`, `workbench-reports`, `workbench-demo-copy`, and `workbench-quota` routes are unaffected.

Logs must not include token, secrets, connection strings, or full internal stacks.
