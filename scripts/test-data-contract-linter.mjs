import { RuleTester } from 'eslint';
import noForbiddenFields from '../tools/eslint-rules/data-contract/no-forbidden-fields.js';

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2024,
    sourceType: 'module',
  },
});

const error = { messageId: 'forbiddenField' };

ruleTester.run('data-contract/no-forbidden-fields', noForbiddenFields, {
  valid: [
    'modelTrace.usage; modelTrace.conclusionSource; modelTrace.fallbackReason; modelTrace.modelErrorType;',
    'agentConclusion.notice;',
    'metadata.providerLabel; metadata.source;',
    'report.runId; report.sourceCount; report.sourceLineage; report.sourceNoSourceReason;',
    'const { usage, conclusionSource } = modelTrace;',
    'const { notice } = agentConclusion;',
    'delete nextMetadata.source_count; delete nextMetadata.source_lineage; delete nextMetadata.source_no_source_reason;',
    {
      filename: 'tencent/functions/_shared/langchainModelLayer.js',
      code: 'chunk.usage_metadata; chunk.response_metadata.token_usage; chunk.response_metadata.tokenUsage; chunk.additional_kwargs.usage;',
    },
    {
      filename: 'src/utils/runPersistenceMapper.ts',
      code: 'row.source_count; row.source_lineage; row.source_no_source_reason;',
    },
  ],
  invalid: [
    { code: 'obj.tokenUsage;', errors: [error] },
    { code: 'obj["tokenUsage"];', errors: [error] },
    { code: 'metadata.tokenUsage;', errors: [error] },
    { code: 'modelTrace?.tokenUsage;', errors: [error] },
    { code: 'agentConclusion.source;', errors: [error] },
    { code: 'agentConclusion["conclusionSource"];', errors: [error] },
    { code: 'const { tokenUsage } = modelTrace;', errors: [error] },
    { code: 'const { source } = agentConclusion;', errors: [error] },
    { code: 'const { metadata: { sources } } = run;', errors: [error] },
    { code: 'function render({ metadata: { source_count } }) {}', errors: [error] },
    { code: 'const usageValue = usage || tokenUsage;', errors: [error] },
    { code: 'const count = sourceCount ?? source_count;', errors: [error] },
    { code: 'const lineage = sourceLineage || source_lineage;', errors: [error] },
    { code: 'const id = runId || run_id;', errors: [error] },
    { code: 'const list = sources || metadata.sources;', errors: [error] },
    { code: "const source = rawRun.conclusionSource ?? 'mock';", errors: [error] },
    { code: 'const payload = { tokenUsage: usage };', errors: [error] },
    { code: 'row.runtime_run_id;', errors: [error] },
    { code: 'row.conclusion_source;', errors: [error] },
  ],
});

console.log('Data Contract linter self-test passed.');
