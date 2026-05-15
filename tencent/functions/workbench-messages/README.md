# workbench-messages

CloudBase HTTP Function for Tencent-10C Workbench message read/write verification:

```txt
GET /api/workbench/messages?conversationId=<conversation-id>
POST /api/workbench/messages
```

This function verifies the CloudBase conversation/message basic loop. It does not migrate reports, Agent Run, SSE, quota, demo conversation copy, frontend code, or the frontend Auth store.

## Route

Configure the CloudBase HTTP route:

```txt
/api/workbench/messages -> workbench-messages
Identity authentication: enabled
Path passthrough: disabled
```

CloudBase HTTP access service does not support dynamic route parameters such as `/api/workbench/conversations/:id/messages`. This function uses the fixed route `/api/workbench/messages` and does not depend on request path passthrough.

`GET` reads `conversationId` from the query string:

```txt
GET /api/workbench/messages?conversationId=<conversation-id>
```

`POST` reads `conversationId` from the JSON body:

```json
{
  "conversationId": "<conversation-id>"
}
```

If `conversationId` is missing, the function returns `400 validation_error` with `Missing conversation id.`.

Without a token, the request should be rejected by the CloudBase gateway before it reaches the function.

## Ownership

Every private request first reuses `_shared/auth.js` to get `currentUser`, then verifies conversation ownership:

```txt
conversations.id = conversationId
conversations._openid = currentUser.openid
conversations.user_id = currentUser.userId
conversations.visibility = 'private'
```

Messages are queried and written with both `_openid` and `user_id`. A missing or non-owned conversation returns `404 not_found` to avoid exposing whether another user's conversation exists.

## GET Query

Supported query parameters:

- `conversationId`: required conversation id.
- `limit`: default `30`, max `100`.
- `before`: simple `created_at` cursor for older messages.

The function reads messages by `conversation_id`, `_openid`, and `user_id`, sorts by `created_at DESC`, then returns the current page in ascending order for frontend compatibility.

Response:

```json
{
  "ok": true,
  "data": {
    "messages": [],
    "nextCursor": null
  }
}
```

## POST Body

Supported fields:

- `conversationId`: required conversation id.
- `role`: required. Allowed values are `user`, `assistant`, and `system`.
- `kind`: optional, defaults to `text`. Allowed values are `text`, `tool_summary`, `report`, `error`, and `system_notice`.
- `content`: required non-empty string.
- `runId`: optional UUID. Non-UUID runtime IDs are ignored at DB column level and should stay in `metadata.runtimeRunId`.
- `clientMessageId`: optional idempotency key.
- `status`: optional, defaults to `completed`. Allowed values are `pending`, `streaming`, `completed`, and `failed`.
- `metadata`: optional object.

If `clientMessageId` exists and a row with the same `user_id + client_message_id` already exists, the function returns the existing message and does not insert a duplicate.

After a new message is inserted, the function updates the parent conversation:

```txt
message_count = previous message_count + 1
updated_at = MySQL ON UPDATE CURRENT_TIMESTAMP(3)
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

`metadata` is `JSON.stringify(...)` before writing to MySQL and safely parsed before returning.

## Transaction Note

Tencent-10C does not use a transaction. The current CloudBase SDK transaction support for this route is not wired in this function, so `messages` insert and `conversations.message_count` update run sequentially. Before high-concurrency production traffic, this should be moved to a transaction or an atomic SQL update path.

## Package

Upload a source package only. Do not include `node_modules`, and do not submit or upload `package-lock.json`. Enable CloudBase automatic dependency installation.

Because this function uses shared helpers, stage the source package in a Desktop temporary directory and include `_shared` in the zip. Do not commit the zip.

```powershell
cd tencent/functions
$stage = Join-Path $env:USERPROFILE 'Desktop\cloudbase-workbench-messages-package'
if (Test-Path $stage) {
  Remove-Item -LiteralPath $stage -Recurse -Force
}
New-Item -ItemType Directory -Force -Path (Join-Path $stage '_shared') | Out-Null
Copy-Item workbench-messages/index.js,workbench-messages/package.json,workbench-messages/scf_bootstrap,workbench-messages/README.md -Destination $stage
Copy-Item _shared/mysql.js,_shared/auth.js -Destination (Join-Path $stage '_shared')
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath (Join-Path $stage 'workbench-messages.zip') -Force
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
cd tencent/functions/workbench-messages
pnpm install --prod
pnpm start
```

## Verify

Syntax check:

```bash
node --check tencent/functions/workbench-messages/index.js
```

Online checks after deployment:

```bash
curl -i "https://<your-domain>/api/workbench/messages?conversationId=<conversation-id>"
curl -i -H "Authorization: Bearer <cloudbase-token>" "https://<your-domain>/api/workbench/messages?conversationId=<conversation-id>"
curl -i -X POST -H "Authorization: Bearer <cloudbase-token>" -H "Content-Type: application/json" -d "{\"conversationId\":\"<conversation-id>\",\"role\":\"user\",\"content\":\"hello\",\"clientMessageId\":\"local-message-1\"}" https://<your-domain>/api/workbench/messages
```

Expected result:

- Without token: CloudBase gateway returns `401 MISSING_CREDENTIALS`.
- With token, `GET` returns `ok: true` and `messages: []` when the conversation has no messages.
- With token, `POST` returns `ok: true` and the new message.
- A later `GET` should include the new message.
- `conversations.message_count` increases after a new non-idempotent message insert.
- Existing `demo-tasks`, `demo-conversations`, and `auth-me` routes are unaffected.

Logs must not include token, secrets, connection strings, or full internal stacks.
