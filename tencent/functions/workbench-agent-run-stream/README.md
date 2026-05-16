# workbench-agent-run-stream

CloudBase HTTP Function for Tencent-21 Agent Run stream verification.

This function keeps the Tencent-14 fixed `basic` mode and updates the `real` mode to read CloudBase MySQL `teaching_metrics` directly through `@cloudbase/node-sdk` / `app.rdb()`. It verifies the CloudBase Agent Run path with Auth, conversation ownership, quota, `agent_runs`, `run_events`, `tool_invocations`, assistant message persistence, SSE output, planner, controlled data tools, lightweight model gateway conclusion generation, and explicit fallback.

It still does not switch the production frontend traffic, does not migrate the full report generation entry, and does not delete the Vercel / Supabase implementation.

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
  "mode": "real"
}
```

Fields:

- `conversationId` is required.
- `prompt` is optional; the function uses a teaching-data analysis prompt when omitted.
- `clientRunId` is optional; the function generates one when omitted.
- `mode = "basic"` keeps the Tencent-14 fixed mock loop.
- Any other `mode`, including omitted `mode`, uses the Tencent-21 `real` path.
- `provider` is ignored in Tencent-21. Real data tools always read CloudBase MySQL `teaching_metrics`.

The function reuses `_shared/auth.js` to get `currentUser`, then checks:

```txt
conversations.id = conversationId
_openid = currentUser.openid
user_id = currentUser.userId
visibility = private
```

## Real Mode

The Tencent-21 `real` path is:

1. Authenticate request and resolve `currentUser`.
2. Read and validate `conversationId`.
3. Consume one Agent Run quota and create `agent_run_usage(status = started)`.
4. Create `agent_runs(status = running)`.
5. Run planner.
6. Stream and persist `run_events`.
7. For `data_analysis`, execute the controlled CloudBase MySQL tool chain:
   - `schema_inspect`
   - `aggregate_table`
   - `chart_render`
8. Persist `tool_invocations` with `tool_name`, `status`, `input`, `output`, `elapsed_ms`, and metadata.
9. Use `_shared/modelGateway.js` to generate the conclusion when a model provider is configured.
10. Fall back explicitly when the model provider is not configured, `teaching_metrics` is missing, queries fail, no rows are returned, or the model provider fails.
11. Insert one assistant `messages` row with source metadata.
12. Mark `agent_runs(status = completed)`.
13. Stream `run_completed`.
14. Finish quota usage with `status = completed`.

If the client disconnects, the function stops writing later SSE events, marks the run as `stopped` where possible, and tries to finish usage as `stopped`. If another error occurs after quota consumption, it tries to finish usage as `failed`.

## Basic Mode

`mode = "basic"` preserves the Tencent-14 fixed loop:

```txt
run_started
step_started
tool_started
tool_completed
conclusion_delta
conclusion_completed
run_completed
```

This mode uses a fixed mock tool result and fixed conclusion text. It remains useful for checking CloudBase SSE, quota, run persistence, event persistence, and assistant message persistence without external model or data-source dependencies.

## Mock / Real / Fallback Boundary

- `basic` mode is a fixed mock verification path and records `source = cloudbase-agent-run-basic-loop`.
- `real` mode calls the local planner rules and the controlled data tools. It never lets a model execute SQL directly.
- `schema_inspect` returns a fixed schema description for `teaching_metrics`.
- `aggregate_table` reads `teaching_metrics` through CloudBase MySQL and aggregates in JavaScript by month, grade, or subject.
- `chart_render` converts aggregate results into chart config and series data; it does not render an image.
- `conclusionSource = "groq"` means the Groq compatibility provider generated the final conclusion.
- `conclusionSource = "openai-compatible"` means the generic OpenAI-compatible model gateway generated the final conclusion.
- `conclusionSource = "fallback"` means the final conclusion was generated locally, and `fallbackReason` explains why.
- `knowledge_qa` currently returns an explicit `rag_not_migrated` fallback because the existing RAG path depends on Supabase Admin / knowledge tables that are not migrated to CloudBase in this step.
- The assistant message metadata records `source`, `conclusionSource`, `fallbackReason`, `modelProvider`, `modelName`, `modelErrorType`, `modelHttpStatus`, `modelErrorMessage`, `agentMode`, and `runtimeRunId`.

## Environment Variables

Do not hard-code keys or connection strings in source code.

Preferred model gateway configuration:

```txt
MODEL_GATEWAY_PROVIDER=openai-compatible
MODEL_GATEWAY_BASE_URL=https://provider.example.com/v1
MODEL_GATEWAY_API_KEY=...
MODEL_GATEWAY_MODEL=...
```

Groq compatibility configuration remains supported when no `MODEL_GATEWAY_*` variables are set:

```txt
GROQ_API_KEY=...
GROQ_MODEL=llama-3.1-8b-instant
CLOUDBASE_ENV_ID / TCB_ENV_ID Provided by CloudBase runtime or deployment config.
```

Tencent-21 no longer needs `POSTGRES_CONNECTION_STRING` or `SUPABASE_DB_CONNECTION_STRING` for Agent Run data tools. CloudBase MySQL access comes from the CloudBase function runtime through `@cloudbase/node-sdk` and `app.rdb()`.

Model keys must be CloudBase function environment variables only. Do not put `MODEL_GATEWAY_API_KEY` or `GROQ_API_KEY` in EdgeOne / frontend `VITE_*` variables.

When no model provider is configured, the function should still return SSE and complete the run through explicit fallback instead of returning 500. `_shared/modelGateway.js` is intentionally lightweight: it only wraps OpenAI-compatible chat completions and normalized diagnostics, not an enterprise model platform.

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

Model diagnostics are deliberately redacted. Function logs record only:

```txt
hasModelApiKey
modelApiKeyLength
modelProvider
modelName
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
  "conclusionSource": "fallback",
  "fallbackReason": "model_not_configured",
  "modelProvider": "groq",
  "modelName": "llama-3.1-8b-instant"
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

This Tencent-21 verification still uses sequential writes rather than a full MySQL transaction. Before switching production Agent Run traffic, quota consume should be upgraded to transaction + row lock or equivalent atomic update, and run/message/event writes should be reviewed for consistency under failures and disconnects.

## Package

Upload a source package only. Do not include `node_modules`, and do not submit or upload `package-lock.json`. Enable CloudBase automatic dependency installation. This function depends on `@cloudbase/node-sdk`.

Because this function uses shared helpers, stage the source package in a Desktop temporary directory and include `_shared` in the zip. Use Git Bash:

```bash
cd tencent/functions
stage="$HOME/Desktop/cloudbase-workbench-agent-run-stream-package"
rm -rf "$stage"
mkdir -p "$stage/_shared"
cp workbench-agent-run-stream/index.js workbench-agent-run-stream/package.json workbench-agent-run-stream/scf_bootstrap workbench-agent-run-stream/README.md "$stage/"
cp _shared/mysql.js _shared/auth.js _shared/modelGateway.js "$stage/_shared/"
chmod +x "$stage/scf_bootstrap"
(cd "$stage" && zip -r workbench-agent-run-stream.zip index.js package.json README.md scf_bootstrap _shared)
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
node --check tencent/functions/_shared/modelGateway.js
node --check tencent/functions/workbench-agent-run-stream/index.js
```

Online checks after deployment:

```bash
curl -i https://<your-domain>/api/agent/run/stream
curl -N -i -X POST \
  -H "Authorization: Bearer <cloudbase-token>" \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"测试提示词\",\"conversationId\":\"<conversation-id>\",\"clientRunId\":\"manual-basic-run\",\"mode\":\"basic\"}" \
  https://<your-domain>/api/agent/run/stream
curl -N -i -X POST \
  -H "Authorization: Bearer <cloudbase-token>" \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"分析本月教学质量数据，找出异常指标\",\"conversationId\":\"<conversation-id>\",\"clientRunId\":\"manual-real-run\",\"mode\":\"real\"}" \
  https://<your-domain>/api/agent/run/stream
```

Expected result:

- Without token: CloudBase gateway returns `401 MISSING_CREDENTIALS`.
- With token but missing or foreign `conversationId`: the function returns `validation_error` or `not_found`.
- `mode = "basic"` streams the fixed Tencent-14 event sequence.
- `mode = "real"` streams `schema_inspect` / `aggregate_table` / `chart_render` tool completions, chart, conclusion, and completion events where available.
- If the model provider succeeds after data tools succeed, the real mode returns provider-specific `conclusionSource`, such as `openai-compatible` or `groq`.
- If the model provider fails after data tools succeed, the real mode returns `conclusionSource = "fallback"` and a specific `fallbackReason`, such as `model_unauthorized`, `model_forbidden`, `model_not_found`, `model_rate_limited`, `model_timeout`, `model_network_error`, `model_response_parse_failed`, or `model_failed`.
- `conclusion_completed` and `run_completed` include `modelProvider`, `modelName`, `modelErrorType`, `modelHttpStatus`, and redacted `modelErrorMessage` when available; neither event includes raw tokens or request headers.
- `quotaUsed` increases for `demo_user`.
- `messages` contains the assistant message.
- `agent_runs`, `run_events`, and `tool_invocations` contain records for the run.
- Existing `demo-tasks`, `demo-conversations`, `auth-me`, `workbench-conversations`, `workbench-messages`, `workbench-reports`, `workbench-demo-copy`, and `workbench-quota` routes are unaffected.

Logs must not include token, secrets, connection strings, or full internal stacks.
