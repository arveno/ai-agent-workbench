# workbench-evaluations

CloudBase HTTP Function for Workbench Evaluation / Bad Case review.

`eval_results` remains the project Evaluation fact source. LangSmith feedback / dataset / experiment semantics are external observability metadata and never replace canonical `runId`, `caseId`, or `eval_results.id`.

## Route

Configure one fixed CloudBase HTTP route with path passthrough disabled:

```txt
/api/workbench/evaluations -> workbench-evaluations
```

`GET resource=cases` is public. `GET resource=results` and `POST` require CloudBase Auth.

## API

```txt
GET /api/workbench/evaluations?resource=cases
GET /api/workbench/evaluations?resource=cases&category=<category>
GET /api/workbench/evaluations?resource=results&limit=20
GET /api/workbench/evaluations?resource=results&caseId=<case-id>
POST /api/workbench/evaluations
```

`POST` accepts either `resource: "results"` or `action: "createResult"` and creates one `eval_results` row.

## Auth

The function reuses `_shared/auth.js` and writes `_openid` / `user_id` from `currentUser`. Client-provided ownership fields are never trusted.

## Permission Boundary

`eval_cases` is public but only active cases are returned. `eval_results` is private user data and is always filtered by:

```txt
eval_results._openid = currentUser.openid
eval_results.user_id = currentUser.userId
```

When a result references `conversationId`, the function verifies the row exists in `conversations` for the same `_openid` and `user_id`. When a result references `runId`, it must be a canonical UUID and resolves through `agent_runs.id` for the same `_openid` and `user_id`. If both conversation and run are present, `agent_runs.conversation_id` must match the supplied conversation.

Missing or cross-user conversations/runs return not-found style errors and do not reveal whether another user's resource exists.

## Raw Payloads

Evaluation results store compact summaries only:

- `actualSummary`
- `modelTrace`
- `toolSummary`
- `ragSummary`
- `reportSummary`
- `metadata`

The function rejects obvious raw fields such as `runEvents`, `toolRawPayload`, `rawToolInput`, and `rawToolOutput`. It does not copy raw `run_events`, raw tool input, or raw tool output into `eval_results`.

## LangSmith Boundary

- LangSmith feedback is submitted server-side only when configured.
- `LANGSMITH_API_KEY` / `LANGCHAIN_API_KEY` must stay in CloudBase function environment variables and must not enter frontend `VITE_*` variables.
- LangSmith unavailable, not configured, failed, or timed out states are recorded explicitly in result metadata.
- LangSmith trace / run / feedback ids are external ids only; they do not replace `eval_results.run_id`, `eval_results.case_id`, or project Evaluation relationships.

## Package

Package with the repo script:

```bash
pnpm cloudbase:package -- --function workbench-evaluations --out ./.cloudbase-packages --clean --check
```
