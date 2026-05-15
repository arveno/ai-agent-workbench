# workbench-demo-copy

CloudBase HTTP Function for Tencent-12 demo conversation copy verification:

```txt
POST /api/workbench/demo-copy
```

This function copies an enabled public demo conversation template into the current user's private `conversations` and `messages`. It does not migrate frontend code, Agent Run, SSE, quota, or reports.

## Route

Configure the CloudBase HTTP route:

```txt
/api/workbench/demo-copy -> workbench-demo-copy
Identity authentication: enabled
Path passthrough: disabled
```

CloudBase HTTP access service does not support dynamic route parameters such as `/api/workbench/demo-conversations/:id/copy`; this function uses the fixed route `/api/workbench/demo-copy`.

Without a token, the request should be rejected by the CloudBase gateway before it reaches the function.

## POST Body

```json
{
  "templateId": "demo_conversation_templates.id"
}
```

The function loads one template from `demo_conversation_templates` with:

```txt
id = templateId
is_enabled = 1
visibility in ('demo', 'system')
```

If the template is missing or disabled, it returns `404 not_found`.

## Copy Behavior

The function creates one private conversation:

```txt
id = crypto.randomUUID()
_openid = currentUser.openid
user_id = currentUser.userId
title = template.title
summary = template.description
mode = 'mock'
status = 'active'
visibility = 'private'
source_template_id = templateId
message_count = normalized seed_messages length
metadata = JSON.stringify({ source, templateId, templateCategory, copiedAt })
```

Then it writes every valid `seed_messages` entry into `messages` with `_openid`, `user_id`, `conversation_id`, `role`, `kind`, `content`, `status`, `client_message_id`, and JSON-stringified `metadata`.

Empty `seed_messages` is allowed and only creates the conversation.

Response:

```json
{
  "ok": true,
  "data": {
    "conversation": {
      "id": "..."
    },
    "messagesCount": 0
  }
}
```

## Consistency Note

Tencent-12 uses sequential writes because the CloudBase SDK transaction path is not wired into this function. If message insertion fails after the conversation is created, the function attempts a best-effort delete of that conversation; the schema's foreign key cascade should remove inserted messages. High-consistency production traffic should move this to a transaction.

## Package

Upload a source package only. Do not include `node_modules`, and do not submit or upload `package-lock.json`. Enable CloudBase automatic dependency installation.

Because this function uses shared helpers, stage the source package in a Desktop temporary directory and include `_shared` in the zip. Do not commit the zip.

```bash
cd tencent/functions
stage="$HOME/Desktop/cloudbase-workbench-demo-copy-package"
rm -rf "$stage"
mkdir -p "$stage/_shared"
cp workbench-demo-copy/index.js workbench-demo-copy/package.json workbench-demo-copy/scf_bootstrap workbench-demo-copy/README.md "$stage/"
cp _shared/mysql.js _shared/auth.js "$stage/_shared/"
chmod +x "$stage/scf_bootstrap"
(cd "$stage" && zip -r workbench-demo-copy.zip index.js package.json README.md scf_bootstrap _shared)
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
cd tencent/functions/workbench-demo-copy
pnpm install --prod
pnpm start
```

## Verify

Syntax check:

```bash
node --check tencent/functions/workbench-demo-copy/index.js
```

Online checks after deployment:

```bash
curl -i https://<your-domain>/api/workbench/demo-copy
curl -i -X POST -H "Authorization: Bearer <cloudbase-token>" -H "Content-Type: application/json" -d "{}" https://<your-domain>/api/workbench/demo-copy
curl -i -X POST -H "Authorization: Bearer <cloudbase-token>" -H "Content-Type: application/json" -d "{\"templateId\":\"<template-id>\"}" https://<your-domain>/api/workbench/demo-copy
curl -i -H "Authorization: Bearer <cloudbase-token>" "https://<your-domain>/api/workbench/conversations?limit=20"
curl -i -H "Authorization: Bearer <cloudbase-token>" "https://<your-domain>/api/workbench/messages?conversationId=<copied-conversation-id>"
```

Expected result:

- Without token: CloudBase gateway returns `401 MISSING_CREDENTIALS`.
- With token but missing `templateId`: returns `validation_error`.
- With token and a valid `templateId`: returns `ok: true`, `conversation`, and `messagesCount`.
- Reading conversations should include the copied conversation.
- Reading messages for the copied conversation should include seed messages when the template has seed messages.
- Existing `demo-tasks`, `demo-conversations`, `auth-me`, `workbench-conversations`, `workbench-messages`, and `workbench-reports` routes are unaffected.

Logs must not include token, secrets, connection strings, or full internal stacks.
