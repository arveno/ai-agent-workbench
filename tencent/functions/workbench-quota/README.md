# workbench-quota

CloudBase HTTP Function for Tencent-13 Workbench quota basic loop verification:

```txt
GET /api/workbench/quota
POST /api/workbench/quota
```

This function verifies the CloudBase quota read / consume / finish loop. It does not connect to real Agent Run, does not write SSE, and does not migrate frontend quota logic.

## Routes

Configure one fixed CloudBase HTTP route. Do not use dynamic routes, and do not rely on path passthrough.

```txt
/api/workbench/quota -> workbench-quota
Identity authentication: enabled
Path passthrough: disabled
```

Without a token, the request should be rejected by the CloudBase gateway before it reaches the function.

## Ownership

Every request reuses `_shared/auth.js` to get `currentUser`. All private queries and writes include:

```txt
_openid = currentUser.openid
user_id = currentUser.userId
```

## GET Quota

```txt
GET /api/workbench/quota
```

The function reads the current user's current-month `agent_run_quota`. If the record does not exist, it creates one:

```txt
quota_type = agent_run
quota_limit = 20
quota_used = 0
period_start = current month first day 00:00:00
period_end = next month first day 00:00:00
metadata = {}
```

Response:

```json
{
  "ok": true,
  "data": {
    "quota": {
      "quotaType": "agent_run",
      "quotaLimit": 20,
      "quotaUsed": 0,
      "remaining": 20,
      "periodStart": "2026-05-01 00:00:00.000",
      "periodEnd": "2026-06-01 00:00:00.000"
    }
  }
}
```

## POST Consume

```txt
POST /api/workbench/quota
```

Body:

```json
{
  "action": "consume",
  "runId": "optional-runtime-run-id",
  "metadata": {}
}
```

Rules:

- `admin` users do not increase `quota_used`, but still create an `agent_run_usage` record.
- `demo_user` users consume one quota when `quota_used < quota_limit`.
- When quota is exhausted, the function returns `quota_exceeded`.
- Created usage uses `status = started`.

Response:

```json
{
  "ok": true,
  "data": {
    "usageId": "...",
    "quota": {
      "quotaType": "agent_run",
      "quotaLimit": 20,
      "quotaUsed": 1,
      "remaining": 19,
      "periodStart": "...",
      "periodEnd": "..."
    }
  }
}
```

## POST Finish

```txt
POST /api/workbench/quota
```

Body:

```json
{
  "action": "finish",
  "usageId": "...",
  "status": "completed",
  "errorCode": null,
  "metadata": {}
}
```

Allowed `status` values are `completed`, `failed`, and `stopped`. The update is filtered by `usageId + _openid + user_id`. Missing or invalid `action` returns `validation_error`.

Response:

```json
{
  "ok": true,
  "data": {
    "usage": {
      "id": "...",
      "status": "completed"
    }
  }
}
```

`metadata` is `JSON.stringify(...)` before writing to MySQL and safely parsed after reading.

## Transaction Note

Tencent-13 is a basic loop verification. It currently uses sequential writes instead of a MySQL transaction.

Before this function is connected to real Agent Run, `consume` must be upgraded to a MySQL transaction with row lock, for example `SELECT ... FOR UPDATE` on the current user's monthly `agent_run_quota`, then quota increment and `agent_run_usage` insert in the same transaction. This avoids concurrent quota over-consumption.

## Package

Upload a source package only. Do not include `node_modules`, and do not submit or upload `package-lock.json`. Enable CloudBase automatic dependency installation.

Because this function uses shared helpers, stage the source package in a Desktop temporary directory and include `_shared` in the zip. Do not commit the zip.

Use Git Bash:

```bash
cd tencent/functions
stage="$HOME/Desktop/cloudbase-workbench-quota-package"
rm -rf "$stage"
mkdir -p "$stage/_shared"
cp workbench-quota/index.js workbench-quota/package.json workbench-quota/scf_bootstrap workbench-quota/README.md "$stage/"
cp _shared/mysql.js _shared/auth.js "$stage/_shared/"
chmod +x "$stage/scf_bootstrap"
(cd "$stage" && zip -r workbench-quota.zip index.js package.json README.md scf_bootstrap _shared)
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
cd tencent/functions/workbench-quota
pnpm install --prod
pnpm start
```

## Verify

Syntax check:

```bash
node --check tencent/functions/workbench-quota/index.js
```

Online checks after deployment:

```bash
curl -i https://<your-domain>/api/workbench/quota
curl -i -H "Authorization: Bearer <cloudbase-token>" https://<your-domain>/api/workbench/quota
curl -i -X POST -H "Authorization: Bearer <cloudbase-token>" -H "Content-Type: application/json" -d "{\"action\":\"consume\",\"runId\":\"manual-test\",\"metadata\":{\"source\":\"curl\"}}" https://<your-domain>/api/workbench/quota
curl -i -X POST -H "Authorization: Bearer <cloudbase-token>" -H "Content-Type: application/json" -d "{\"action\":\"finish\",\"usageId\":\"<usage-id>\",\"status\":\"completed\",\"metadata\":{\"source\":\"curl\"}}" https://<your-domain>/api/workbench/quota
curl -i -H "Authorization: Bearer <cloudbase-token>" https://<your-domain>/api/workbench/quota
```

Expected result:

- Without token: CloudBase gateway returns `401 MISSING_CREDENTIALS`.
- Reading quota returns `ok: true` and `quota`.
- Consuming quota returns `ok: true`, `usageId`, and updated quota.
- Finishing usage returns `ok: true` and updated usage.
- A later quota read shows `quotaUsed` changed for `demo_user`.
- Existing `demo-tasks`, `demo-conversations`, `auth-me`, `workbench-conversations`, `workbench-messages`, `workbench-reports`, and `workbench-demo-copy` routes are unaffected.

Logs must not include token, secrets, connection strings, or full internal stacks.
