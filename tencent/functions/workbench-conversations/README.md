# workbench-conversations

CloudBase HTTP Function for Tencent-10A:

```txt
GET /api/workbench/conversations
```

This function is a read-only verification entry for private Workbench conversations. It does not migrate `POST` / `PATCH`, messages, reports, Agent Run, SSE, quota, or the frontend Auth store.

## Route

Configure the CloudBase HTTP route:

```txt
/api/workbench/conversations -> workbench-conversations
Identity authentication: enabled
```

Without a token, the request should be rejected by the CloudBase gateway before it reaches the function.

## Query

Supported query parameters:

- `limit`: default `20`, max `50`.
- `cursor`: compatible with the existing `updated_at` cursor.
- `status`: one of `active`, `running`, `completed`, `failed`, `archived`.

Default listing excludes `archived`. When `status` is provided, the function applies that status explicitly.

All private queries are scoped by:

```txt
_openid = currentUser.openid
user_id = currentUser.userId
visibility = 'private'
```

## Response

The response shape stays compatible with the existing frontend `conversationApi`:

```json
{
  "ok": true,
  "data": {
    "conversations": [],
    "nextCursor": null
  }
}
```

`metadata` is safely parsed after reading from MySQL. Failed JSON parsing falls back to `{}`.

## Package

Upload a source package only. Do not include `node_modules`, and do not submit or upload `package-lock.json`. Enable CloudBase automatic dependency installation.

Because this function uses shared helpers, stage the source package in a Desktop temporary directory and include `_shared` in the zip. Do not commit the zip.

```powershell
cd tencent/functions
$stage = Join-Path $env:USERPROFILE 'Desktop\ai-agent-workbench-workbench-conversations'
if (Test-Path $stage) {
  Remove-Item -LiteralPath $stage -Recurse -Force
}
New-Item -ItemType Directory -Force -Path (Join-Path $stage '_shared') | Out-Null
Copy-Item workbench-conversations/index.js,workbench-conversations/package.json,workbench-conversations/scf_bootstrap,workbench-conversations/README.md -Destination $stage
Copy-Item _shared/mysql.js,_shared/auth.js -Destination (Join-Path $stage '_shared')
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath (Join-Path $stage 'workbench-conversations.zip') -Force
```

For local dependency installation:

```bash
cd tencent/functions/workbench-conversations
pnpm install --prod
pnpm start
```

## Verify

Syntax check:

```bash
node --check tencent/functions/workbench-conversations/index.js
```

Online checks after deployment:

```bash
curl -i https://<your-domain>/api/workbench/conversations
curl -i -H "Authorization: Bearer <cloudbase-token>" https://<your-domain>/api/workbench/conversations
```

Expected result:

- Without token: CloudBase gateway returns `401 MISSING_CREDENTIALS`.
- With token: returns `ok: true`.
- If the current user has no private conversations: returns `conversations: []`.
- Existing `demo-tasks` and `demo-conversations` routes are unaffected.

Logs must not include token, secrets, connection strings, or full internal stacks.
