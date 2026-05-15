# workbench-reports

CloudBase HTTP Function for Tencent-11 Workbench report artifact verification:

```txt
GET /api/workbench/reports?conversationId=<conversation-id>
GET /api/workbench/reports?id=<report-id>
POST /api/workbench/reports
```

This function verifies the CloudBase reports basic loop. It does not migrate Agent Run, SSE, quota, frontend code, or the frontend Auth store.

## Route

Configure the CloudBase HTTP route:

```txt
/api/workbench/reports -> workbench-reports
Identity authentication: enabled
Path passthrough: disabled
```

Without a token, the request should be rejected by the CloudBase gateway before it reaches the function.

## Ownership

Every private request first reuses `_shared/auth.js` to get `currentUser`. Conversation-scoped list and create requests verify parent conversation ownership:

```txt
conversations.id = conversationId
conversations._openid = currentUser.openid
conversations.user_id = currentUser.userId
conversations.visibility = 'private'
```

Single report reads are filtered by:

```txt
report_artifacts.id = id
report_artifacts._openid = currentUser.openid
report_artifacts.user_id = currentUser.userId
```

## GET Query

List reports under a conversation:

```txt
GET /api/workbench/reports?conversationId=<conversation-id>
```

Response:

```json
{
  "ok": true,
  "data": {
    "reports": []
  }
}
```

Read one report:

```txt
GET /api/workbench/reports?id=<report-id>
```

Response:

```json
{
  "ok": true,
  "data": {
    "id": "..."
  }
}
```

When both `id` and `conversationId` exist, `id` takes priority.

## POST Body

Supported fields:

- `conversationId`: required conversation id.
- `runId`: optional UUID. Omit it for Tencent-11 browser verification because Agent Run is not migrated in this step.
- `title`: optional string. Empty values default to `分析报告`.
- `contentMarkdown`: required non-empty string.
- `status`: optional. Allowed values are `draft`, `generated`, and `archived`; invalid values default to `generated`.
- `metadata`: optional object.

Response:

```json
{
  "ok": true,
  "data": {
    "id": "..."
  }
}
```

`metadata` is `JSON.stringify(...)` before writing to MySQL and safely parsed before returning.

## Package

Upload a source package only. Do not include `node_modules`, and do not submit or upload `package-lock.json`. Enable CloudBase automatic dependency installation.

Because this function uses shared helpers, stage the source package in a Desktop temporary directory and include `_shared` in the zip. Do not commit the zip.

```powershell
cd tencent/functions
$stage = Join-Path $env:USERPROFILE 'Desktop\cloudbase-workbench-reports-package'
if (Test-Path $stage) {
  Remove-Item -LiteralPath $stage -Recurse -Force
}
New-Item -ItemType Directory -Force -Path (Join-Path $stage '_shared') | Out-Null
Copy-Item workbench-reports/index.js,workbench-reports/package.json,workbench-reports/scf_bootstrap,workbench-reports/README.md -Destination $stage
Copy-Item _shared/mysql.js,_shared/auth.js -Destination (Join-Path $stage '_shared')
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath (Join-Path $stage 'workbench-reports.zip') -Force
```

Zip root must contain:

```txt
_shared/
index.js
package.json
README.md
scf_bootstrap
```

For local dependency installation:

```bash
cd tencent/functions/workbench-reports
pnpm install --prod
pnpm start
```

## Verify

Syntax check:

```bash
node --check tencent/functions/workbench-reports/index.js
```

Online checks after deployment:

```bash
curl -i https://<your-domain>/api/workbench/reports
curl -i -H "Authorization: Bearer <cloudbase-token>" https://<your-domain>/api/workbench/reports
curl -i -X POST -H "Authorization: Bearer <cloudbase-token>" -H "Content-Type: application/json" -d "{\"title\":\"分析报告\",\"contentMarkdown\":\"# 测试报告\"}" https://<your-domain>/api/workbench/reports
curl -i -X POST -H "Authorization: Bearer <cloudbase-token>" -H "Content-Type: application/json" -d "{\"conversationId\":\"<conversation-id>\",\"title\":\"分析报告\",\"contentMarkdown\":\"# 测试报告\",\"status\":\"generated\",\"metadata\":{\"source\":\"browser-test\"}}" https://<your-domain>/api/workbench/reports
curl -i -H "Authorization: Bearer <cloudbase-token>" "https://<your-domain>/api/workbench/reports?conversationId=<conversation-id>"
```

Expected result:

- Without token: CloudBase gateway returns `401 MISSING_CREDENTIALS`.
- With token but missing `conversationId` on create: returns `validation_error`.
- With token and valid `conversationId`: `POST` returns `ok: true` and the new report.
- A later `GET` by `conversationId` returns `reports` containing the new report.
- Existing `demo-tasks`, `demo-conversations`, `auth-me`, `workbench-conversations`, and `workbench-messages` routes are unaffected.

Logs must not include token, secrets, connection strings, or full internal stacks.
