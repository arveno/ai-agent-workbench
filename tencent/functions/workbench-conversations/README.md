# workbench-conversations

CloudBase HTTP Function for Tencent-10A / Tencent-10C:

```txt
GET /api/workbench/conversations
POST /api/workbench/conversations
```

This function verifies private Workbench conversation listing and creation on CloudBase. It does not itself handle messages; Tencent-10C handles basic message GET/POST in the separate `workbench-messages` function. It does not migrate `PATCH`, `DELETE`, archive, reports, Agent Run, SSE, quota, demo conversation copy, or the frontend Auth store.

## Route

Configure the CloudBase HTTP route:

```txt
/api/workbench/conversations -> workbench-conversations
Identity authentication: enabled
```

Without a token, the request should be rejected by the CloudBase gateway before it reaches the function.

## GET Query

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

The `GET` response shape stays compatible with the existing frontend `conversationApi`:

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

## POST Body

The `POST` body is compatible with the existing `createConversation` input:

- `title`: optional string. Empty values default to `新会话`.
- `summary`: optional string. Empty values become `null`.
- `mode`: optional string. Allowed values are `mock`, `agent`, and `mixed`; invalid values default to `mock` for compatibility with loose callers.
- `metadata`: optional object. Non-object values become `{}`.

The created row always includes:

```txt
id = crypto.randomUUID()
_openid = currentUser.openid
user_id = currentUser.userId
status = 'active'
visibility = 'private'
message_count = 0
```

`metadata` is `JSON.stringify(...)` before writing to MySQL and safely parsed before returning.

The `POST` response shape is:

```json
{
  "ok": true,
  "data": {
    "id": "..."
  }
}
```

## Package

Upload a source package only. Do not include `node_modules`, and do not submit or upload `package-lock.json`. Enable CloudBase automatic dependency installation.

Because this function uses shared helpers, stage the source package in a Desktop temporary directory and include `_shared` in the zip. Do not commit the zip.

```powershell
cd tencent/functions
$stage = Join-Path $env:USERPROFILE 'Desktop\cloudbase-workbench-conversations-package'
if (Test-Path $stage) {
  Remove-Item -LiteralPath $stage -Recurse -Force
}
New-Item -ItemType Directory -Force -Path (Join-Path $stage '_shared') | Out-Null
Copy-Item workbench-conversations/index.js,workbench-conversations/package.json,workbench-conversations/scf_bootstrap,workbench-conversations/README.md -Destination $stage
Copy-Item _shared/mysql.js,_shared/auth.js -Destination (Join-Path $stage '_shared')
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath (Join-Path $stage 'workbench-conversations.zip') -Force
```

Zip root must contain:

```txt
index.js
package.json
scf_bootstrap
README.md
_shared/
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
curl -i -X POST -H "Authorization: Bearer <cloudbase-token>" -H "Content-Type: application/json" -d "{\"title\":\"新会话\",\"mode\":\"mock\"}" https://<your-domain>/api/workbench/conversations
```

Expected result:

- Without token: CloudBase gateway returns `401 MISSING_CREDENTIALS`.
- With token, `GET` returns `ok: true`.
- With token, `POST` returns `ok: true` and a new conversation record.
- After `POST`, `GET` should include the newly created conversation.
- If the current user has no private conversations before creation: returns `conversations: []`.
- Existing `demo-tasks` and `demo-conversations` routes are unaffected.

Logs must not include token, secrets, connection strings, or full internal stacks.
