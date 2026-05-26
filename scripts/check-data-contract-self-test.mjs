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
    name: 'optional chaining agentConclusion.source',
    code: 'const source = agentConclusion?.source;',
    labels: ['agentConclusion.source'],
  },
  {
    name: 'optional chaining rawRun.conclusionSource mock fallback',
    code: "const source = rawRun?.conclusionSource ?? 'mock';",
    labels: ["rawRun.conclusionSource ?? 'mock'"],
  },
  {
    name: 'allowed canonical fields',
    code: `
      const view = {
        metadataProvider: metadata.providerLabel,
        source: agentConclusion?.conclusionSource,
        usage: modelTrace?.usage,
        conclusionSource: rawRun?.conclusionSource ?? 'unknown',
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
