# workbench-runs

CloudBase HTTP Function for Tencent-26 Workbench Agent Run recovery:

```txt
GET /api/workbench/runs?conversationId=<conversation-id>&latest=1
GET /api/workbench/runs?runId=<run-id>
```

The function restores the latest or specified `agent_runs` row together with its `run_events` and `tool_invocations`. It is read-only and does not create runs, consume quota, write messages, or replay Agent Run execution.

## Route

Configure the CloudBase HTTP route:

```txt
/api/workbench/runs -> workbench-runs
Identity authentication: enabled
Path passthrough: disabled
```

Without a token, the request should be rejected by the CloudBase gateway before it reaches the function.

## Ownership

Every request reuses `_shared/auth.js` to get `currentUser`.

Conversation latest reads verify parent conversation ownership first:

```txt
conversations.id = conversationId
conversations._openid = currentUser.openid
conversations.user_id = currentUser.userId
conversations.visibility = 'private'
```

Run reads are filtered by:

```txt
agent_runs._openid = currentUser.openid
agent_runs.user_id = currentUser.userId
agent_runs.id = runId OR agent_runs.runtime_run_id = runId
```

Supporting rows are filtered by `_openid`, `user_id`, `run_id`, and `conversation_id` before returning.

## Response

When a run exists:

```json
{
  "ok": true,
  "data": {
    "run": {},
    "events": [],
    "toolInvocations": []
  }
}
```

When the run does not exist:

```json
{
  "ok": true,
  "data": {
    "run": null,
    "events": [],
    "toolInvocations": []
  }
}
```

`plan`, `data_source_snapshot`, `chart_data`, `metadata`, `payload`, `input`, and `output` are safely parsed from MySQL JSON values before returning.

## Package

Upload a source package only. Do not include `node_modules`, and do not submit or upload lockfiles. Enable CloudBase automatic dependency installation.

Because this function uses shared helpers, stage the source package in a Desktop temporary directory and include `_shared` in the zip. Do not commit the zip.

```bash
cd tencent/functions
stage="$HOME/Desktop/cloudbase-workbench-runs-package"
rm -rf "$stage"
mkdir -p "$stage/_shared"
cp workbench-runs/index.js workbench-runs/package.json workbench-runs/scf_bootstrap workbench-runs/README.md "$stage/"
cp _shared/mysql.js _shared/auth.js "$stage/_shared/"
chmod +x "$stage/scf_bootstrap"
(cd "$stage" && zip -r workbench-runs.zip index.js package.json README.md scf_bootstrap _shared)
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
node --check tencent/functions/workbench-runs/index.js
```

Online checks after deployment:

```bash
curl -i https://<your-domain>/api/workbench/runs
curl -i -H "Authorization: Bearer <cloudbase-token>" "https://<your-domain>/api/workbench/runs?conversationId=<conversation-id>&latest=1"
curl -i -H "Authorization: Bearer <cloudbase-token>" "https://<your-domain>/api/workbench/runs?runId=<run-id>"
```

Expected result:

- Without token: CloudBase gateway returns `401 MISSING_CREDENTIALS`.
- With token but missing `conversationId` and `runId`: returns `validation_error`.
- With token and no existing run: returns `ok: true` and an empty run bundle.
- With token and an existing run: returns `run`, sorted `events`, and sorted `toolInvocations`.
- Existing `demo-tasks`, `demo-conversations`, `auth-me`, `workbench-conversations`, `workbench-messages`, `workbench-reports`, `workbench-demo-copy`, `workbench-quota`, and `workbench-agent-run-stream` routes are unaffected.

Logs must not include token, secrets, connection strings, or full internal stacks.
