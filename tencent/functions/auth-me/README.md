# auth-me

CloudBase HTTP Function for:

```txt
GET /api/auth/me
```

It verifies the CloudBase route-authenticated Bearer token, maps the CloudBase identity to `app_profiles`, creates a first profile when needed, and returns:

```json
{ "ok": true, "data": { "currentUser": {} } }
```

This is the formal Tencent-09A Auth helper verification endpoint. It is not the temporary POC `auth-me` function, and it does not replace the frontend Auth store yet.

## Route

Configure the CloudBase HTTP route:

```txt
/api/auth/me -> auth-me
```

This route must enable CloudBase HTTP route identity authentication. Without a token, the request should be rejected by CloudBase before it reaches the function.

## Behavior

- `OPTIONS` returns `204`.
- `GET` returns the current user profile.
- Other methods return `405`.
- Missing or invalid Bearer token returns `401` if the request reaches the function.
- Disabled `app_profiles.status` returns `403`.
- Errors do not return token, secrets, connection strings, or full internal stacks.

## Package

Upload a source package only. Do not include `node_modules`, and do not submit or upload `package-lock.json`. Enable "auto install dependencies" when creating or updating the CloudBase HTTP Function.

Because `auth-me` uses shared helpers, stage the source package outside the repository and include `_shared` in the zip:

```bash
cd tencent/functions
rm -rf /tmp/ai-agent-workbench-auth-me
mkdir -p /tmp/ai-agent-workbench-auth-me/_shared
cp auth-me/index.js auth-me/package.json auth-me/scf_bootstrap auth-me/README.md /tmp/ai-agent-workbench-auth-me/
cp _shared/mysql.js _shared/auth.js /tmp/ai-agent-workbench-auth-me/_shared/
chmod +x /tmp/ai-agent-workbench-auth-me/scf_bootstrap
cd /tmp/ai-agent-workbench-auth-me
zip -r auth-me.zip index.js package.json scf_bootstrap README.md _shared
```

For local testing:

```bash
cd tencent/functions/auth-me
pnpm install --prod
pnpm start
```

If CloudBase automatic dependency installation fails, troubleshoot dependency installation separately; do not default to committing or uploading `node_modules`.
