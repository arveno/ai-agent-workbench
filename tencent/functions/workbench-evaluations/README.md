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

Every Evaluation result must bind to a canonical Agent Run. `POST` requires `runId`; it must be a canonical UUID and resolves through `agent_runs.id` for the same `_openid` and `user_id`. When a result also references `conversationId`, the function verifies the row exists in `conversations` for the same `_openid` and `user_id`, and `agent_runs.conversation_id` must match the supplied conversation.

Missing or cross-user conversations/runs return not-found style errors and do not reveal whether another user's resource exists.

## Raw Payloads

Evaluation results store compact summaries only:

- `actualSummary`
- `modelTrace`
- `toolSummary`
- `ragSummary`
- `reportSummary`
- `metadata`

Request `metadata` is allowlisted before persistence. Request metadata may only keep evaluation business fields registered in the Contract Pack, currently `evaluatorVersion`; server-owned `source`, `resultVersion`, and LangSmith feedback metadata are set by the function.

The function reads the owned `agent_runs.metadata.modelTrace` row through `_shared/agentRunModelMetadata.js` and syncs only the project canonical `modelTrace` object into `eval_results.metadata` and `model_trace`. `modelTrace.usage` is the canonical model usage field and `modelTrace.costEstimate` is the canonical cost estimate field. Provider no-usage and cost unavailable states remain explicit JSON metadata; no evaluation columns or migrations are added. Results never fall back to request `modelTrace`; if the run has no canonical `modelTrace`, `model_trace` is stored as `{}`.

Evaluation API output normalizes persisted metadata to the Contract Pack `EvaluationMetadata` shape. `metadata.runId` comes from `eval_results.run_id`; `source` and `resultVersion` are server-owned fields; `modelTrace` comes from the persisted server-owned `model_trace` column. Historical `eval_results` rows with null `run_id` are a DB baseline concern and are handled by the DB governance issue, not by runtime fallback.

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

The package root must include `index.js`, `metadata-boundary.js`, `package.json`, `README.md`, `scf_bootstrap`, and the required `_shared` files. If packaging manually, copy any local `.js` helper beside `index.js` into the package root; this function requires `metadata-boundary.js`.
