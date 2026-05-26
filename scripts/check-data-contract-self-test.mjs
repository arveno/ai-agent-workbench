import { findForbiddenMatchesInContent } from './check-data-contract.mjs';

const cases = [
  {
    name: 'dot access metadata.provider',
    code: 'const provider = metadata.provider;',
    labels: ['metadata.provider'],
  },
  {
    name: 'optional chaining metadata.provider',
    code: 'const provider = metadata?.provider;',
    labels: ['metadata.provider'],
  },
  {
    name: 'spaced optional chaining metadata.provider',
    code: 'const provider = metadata ?. provider;',
    labels: ['metadata.provider'],
  },
  {
    name: 'bracket access metadata.provider',
    code: "const provider = metadata['provider'];",
    labels: ['metadata.provider'],
  },
  {
    name: 'optional bracket access metadata.usage',
    code: "const usage = metadata?.['usage'];",
    labels: ['metadata.usage'],
  },
  {
    name: 'optional double-quoted bracket access metadata.costEstimate',
    code: 'const costEstimate = metadata?.["costEstimate"];',
    labels: ['metadata.costEstimate'],
  },
  {
    name: 'optional chaining agentConclusion.source',
    code: 'const source = agentConclusion?.source;',
    labels: ['agentConclusion.source'],
  },
  {
    name: 'bracket access agentConclusion.source',
    code: "const source = agentConclusion['source'];",
    labels: ['agentConclusion.source'],
  },
  {
    name: 'forbidden agentConclusion conclusion source',
    code: 'const source = agentConclusion.conclusionSource;',
    labels: ['agentConclusion.conclusionSource'],
  },
  {
    name: 'forbidden agentConclusion fallback reason',
    code: "const fallbackReason = agentConclusion?.['fallbackReason'];",
    labels: ['agentConclusion.fallbackReason'],
  },
  {
    name: 'forbidden agentConclusion model error type',
    code: 'const modelErrorType = agentConclusion?.modelErrorType;',
    labels: ['agentConclusion.modelErrorType'],
  },
  {
    name: 'optional bracket access modelTrace.tokenUsage',
    code: "const usage = modelTrace?.['tokenUsage'];",
    labels: ['modelTrace.tokenUsage', 'tokenUsage'],
  },
  {
    name: 'forbidden metadata selected model id',
    code: "const selectedModelId = metadata['selectedModelId'];",
    labels: ['metadata.selectedModelId'],
  },
  {
    name: 'forbidden metadata conclusion source',
    code: 'const conclusionSource = metadata?.conclusionSource;',
    labels: ['metadata.conclusionSource'],
  },
  {
    name: 'forbidden metadata fallback reason',
    code: "const fallbackReason = metadata?.['fallbackReason'];",
    labels: ['metadata.fallbackReason'],
  },
  {
    name: 'forbidden metadata model error type',
    code: 'const modelErrorType = metadata.modelErrorType;',
    labels: ['metadata.modelErrorType'],
  },
  {
    name: 'destructured metadata provider',
    code: 'const { provider } = metadata;',
    labels: ['metadata.provider'],
  },
  {
    name: 'destructured metadata provider alias',
    code: 'const { provider: p } = metadata;',
    labels: ['metadata.provider'],
  },
  {
    name: 'destructured metadata usage',
    code: 'const { usage } = metadata;',
    labels: ['metadata.usage'],
  },
  {
    name: 'destructured metadata usage alias',
    code: 'const { usage: canonicalUsage } = metadata;',
    labels: ['metadata.usage'],
  },
  {
    name: 'destructured metadata cost estimate default',
    code: 'const { costEstimate = null } = metadata;',
    labels: ['metadata.costEstimate'],
  },
  {
    name: 'destructured metadata conclusion source',
    code: 'const { conclusionSource } = metadata;',
    labels: ['metadata.conclusionSource'],
  },
  {
    name: 'destructured metadata fallback reason',
    code: 'const { fallbackReason: reason = null } = metadata;',
    labels: ['metadata.fallbackReason'],
  },
  {
    name: 'destructured metadata model error type',
    code: 'const { modelErrorType } = metadata;',
    labels: ['metadata.modelErrorType'],
  },
  {
    name: 'destructured metadata client run id',
    code: 'const { clientRunId } = metadata;',
    labels: ['metadata.clientRunId'],
  },
  {
    name: 'destructured agent conclusion source',
    code: 'const { source } = agentConclusion;',
    labels: ['agentConclusion.source'],
  },
  {
    name: 'destructured agent conclusion conclusion source',
    code: 'const { conclusionSource } = agentConclusion;',
    labels: ['agentConclusion.conclusionSource'],
  },
  {
    name: 'destructured agent conclusion fallback reason',
    code: 'const { fallbackReason } = agentConclusion;',
    labels: ['agentConclusion.fallbackReason'],
  },
  {
    name: 'destructured agent conclusion model error type',
    code: 'const { modelErrorType } = agentConclusion;',
    labels: ['agentConclusion.modelErrorType'],
  },
  {
    name: 'destructured agent conclusion content alias',
    code: 'const { content: markdown = "" } = agentConclusion;',
    labels: ['agentConclusion.content'],
  },
  {
    name: 'destructured agent conclusion summary',
    code: 'const { summary } = agentConclusion;',
    labels: ['agentConclusion.summary'],
  },
  {
    name: 'destructured model trace token usage',
    code: 'const { tokenUsage } = modelTrace;',
    labels: ['tokenUsage', 'modelTrace.tokenUsage'],
  },
  {
    name: 'destructured raw run conclusion source mock fallback',
    code: `
      const { conclusionSource } = rawRun;
      const source = conclusionSource ?? 'mock';
    `,
    labels: ["rawRun.conclusionSource ?? 'mock'"],
  },
  {
    name: 'destructured raw run conclusion source alias mock fallback',
    code: `
      const { conclusionSource: source } = rawRun;
      const finalSource = source ?? 'mock';
    `,
    labels: ["rawRun.conclusionSource ?? 'mock'"],
  },
  {
    name: 'optional chaining rawRun.conclusionSource mock fallback',
    code: "const source = rawRun?.conclusionSource ?? 'mock';",
    labels: ["rawRun.conclusionSource ?? 'mock'"],
  },
  {
    name: 'optional bracket access rawRun.conclusionSource mock fallback',
    code: "const source = rawRun?.['conclusionSource'] ?? 'mock';",
    labels: ["rawRun.conclusionSource ?? 'mock'"],
  },
  {
    name: 'bracket access rawRun.conclusionSource mock fallback',
    code: "const source = rawRun['conclusionSource'] ?? 'mock';",
    labels: ["rawRun.conclusionSource ?? 'mock'"],
  },
  {
    name: 'allowed canonical fields',
    code: `
      const view = {
        metadataProvider: metadata.providerLabel,
        bracketProviderLabel: metadata['providerLabel'],
        notice: agentConclusion.notice,
        bracketNotice: agentConclusion['notice'],
        traceSource: modelTrace.conclusionSource,
        traceFallbackReason: modelTrace.fallbackReason,
        traceModelErrorType: modelTrace.modelErrorType,
        usage: modelTrace?.usage,
        conclusionSource: rawRun?.conclusionSource ?? 'unknown',
        metadataDestructuring: (() => {
          const { providerLabel } = metadata;
          return providerLabel;
        })(),
        traceDestructuring: (() => {
          const { usage, conclusionSource } = modelTrace;
          return { usage, conclusionSource };
        })(),
        conclusionDestructuring: (() => {
          const { notice } = agentConclusion;
          return notice;
        })(),
      };
    `,
    labels: [],
  },
];

const failures = [];

for (const testCase of cases) {
  const labels = findForbiddenMatchesInContent(`${testCase.name}.ts`, testCase.code).map((match) => match.label);
  const missing = testCase.labels.filter((label) => !labels.includes(label));
  const unexpected = labels.filter((label) => !testCase.labels.includes(label));

  if (missing.length > 0 || unexpected.length > 0) {
    failures.push({ name: testCase.name, missing, unexpected });
  }
}

if (failures.length > 0) {
  console.error('Data Contract self-test failed:');
  for (const failure of failures) {
    console.error(`- ${failure.name}`);
    if (failure.missing.length > 0) console.error(`  missing: ${failure.missing.join(', ')}`);
    if (failure.unexpected.length > 0) console.error(`  unexpected: ${failure.unexpected.join(', ')}`);
  }
  process.exit(1);
}

console.log(`Data Contract self-test passed. ${cases.length} cases checked.`);
