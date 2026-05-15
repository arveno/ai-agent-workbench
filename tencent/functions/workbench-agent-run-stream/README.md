# workbench-agent-run-stream

CloudBase HTTP Function for Tencent-14 Agent Run basic loop verification.

This function verifies a fixed CloudBase Agent Run loop with Auth, conversation ownership, quota, `agent_runs`, `run_events`, mock `tool_invocations`, assistant message persistence, and SSE output. It does not call Groq, does not run the real planner, and does not invoke real tools.

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
  "prompt": "测试提示词",
  "conversationId": "current-private-conversation-id",
  "clientRunId": "optional-client-run-id"
}
```

`conversationId` is required. The function reuses `_shared/auth.js` to get `currentUser`, then checks:

```txt
conversations.id = conversationId
_openid = currentUser.openid
user_id = currentUser.userId
visibility = private
```

## Basic Loop

The normal path is:

1. Authenticate request and resolve `currentUser`.
2. Read and validate `conversationId`.
3. Consume one Agent Run quota and create `agent_run_usage(status = started)`.
4. Create `agent_runs(status = running)`.
5. Stream and persist fixed `run_events`.
6. Insert one mock `tool_invocations` row and update it to `completed`.
7. Insert one assistant `messages` row with fixed conclusion text.
8. Mark `agent_runs(status = completed)`.
9. Stream `run_completed`.
10. Finish quota usage with `status = completed`.

If the client disconnects, the function stops writing later SSE events, marks the run as `stopped` where possible, and tries to finish usage as `stopped`. If another error occurs after quota consumption, it tries to finish usage as `failed`.

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

The fixed event sequence is:

```txt
run_started
step_started
tool_started
tool_completed
conclusion_delta
conclusion_completed
run_completed
```

Example event:

```json
{
  "type": "run_completed",
  "runId": "...",
  "usageId": "...",
  "clientRunId": "browser-agent-basic-run-...",
  "conversationId": "...",
  "timestamp": "2026-05-15T00:00:00.000Z",
  "status": "completed",
  "elapsedMs": 2000,
  "assistantMessageId": "..."
}
```

## Persistence

All private writes include:

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

This Tencent-14 basic loop still uses sequential writes rather than a MySQL transaction. Before connecting real Agent Run, quota consume should be upgraded to transaction + row lock, and run/message/event writes should be reviewed for consistency under failures and disconnects.

## Package

Upload a source package only. Do not include `node_modules`, and do not submit or upload `package-lock.json`. Enable CloudBase automatic dependency installation.

Because this function uses shared helpers, stage the source package in a Desktop temporary directory and include `_shared` in the zip. Use Git Bash:

```bash
cd tencent/functions
stage="$HOME/Desktop/cloudbase-workbench-agent-run-stream-package"
rm -rf "$stage"
mkdir -p "$stage/_shared"
cp workbench-agent-run-stream/index.js workbench-agent-run-stream/package.json workbench-agent-run-stream/scf_bootstrap workbench-agent-run-stream/README.md "$stage/"
cp _shared/mysql.js _shared/auth.js "$stage/_shared/"
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
node --check tencent/functions/workbench-agent-run-stream/index.js
```

Online checks after deployment:

```bash
curl -i https://<your-domain>/api/agent/run/stream
curl -N -i -X POST \
  -H "Authorization: Bearer <cloudbase-token>" \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"测试提示词\",\"conversationId\":\"<conversation-id>\",\"clientRunId\":\"manual-basic-run\"}" \
  https://<your-domain>/api/agent/run/stream
```

Expected result:

- Without token: CloudBase gateway returns `401 MISSING_CREDENTIALS`.
- With token and a private `conversationId`: the response streams the fixed event sequence.
- `quotaUsed` increases for `demo_user`.
- `messages` contains the assistant message.
- `agent_runs`, `run_events`, and `tool_invocations` contain records for the run.
- Existing `demo-tasks`, `demo-conversations`, `auth-me`, `workbench-conversations`, `workbench-messages`, `workbench-reports`, `workbench-demo-copy`, and `workbench-quota` routes are unaffected.

Logs must not include token, secrets, connection strings, or full internal stacks.
