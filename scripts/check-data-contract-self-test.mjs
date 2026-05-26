import { findForbiddenMatchesInContent, readForbiddenRules } from './check-data-contract.mjs';

const rules = await readForbiddenRules();

const groups = [
  {
    name: 'property access cases',
    cases: [
      ['metadata.provider dot', 'const value = metadata.provider;', ['metadata.provider']],
      ['metadata.usage dot', 'const value = metadata.usage;', ['metadata.usage']],
      ['metadata.costEstimate dot', 'const value = metadata.costEstimate;', ['metadata.costEstimate']],
      ['agentConclusion.source dot', 'const value = agentConclusion.source;', ['agentConclusion.source']],
      [
        'agentConclusion.modelErrorType dot',
        'const value = agentConclusion.modelErrorType;',
        ['agentConclusion.modelErrorType'],
      ],
      ['modelTrace.tokenUsage dot', 'const value = modelTrace.tokenUsage;', ['tokenUsage', 'modelTrace.tokenUsage']],
    ],
  },
  {
    name: 'optional chaining cases',
    cases: [
      ['metadata?.provider', 'const value = metadata?.provider;', ['metadata.provider']],
      ['metadata ?. usage', 'const value = metadata ?. usage;', ['metadata.usage']],
      ['agentConclusion?.source', 'const value = agentConclusion?.source;', ['agentConclusion.source']],
      ['modelTrace?.tokenUsage', 'const value = modelTrace?.tokenUsage;', ['tokenUsage', 'modelTrace.tokenUsage']],
    ],
  },
  {
    name: 'bracket access cases',
    cases: [
      ["metadata['provider']", "const value = metadata['provider'];", ['metadata.provider']],
      ['metadata["model"]', 'const value = metadata["model"];', ['metadata.model']],
      ["metadata?.['usage']", "const value = metadata?.['usage'];", ['metadata.usage']],
      ['metadata?.["costEstimate"]', 'const value = metadata?.["costEstimate"];', ['metadata.costEstimate']],
      ["agentConclusion['source']", "const value = agentConclusion['source'];", ['agentConclusion.source']],
      ['agentConclusion?.["summary"]', 'const value = agentConclusion?.["summary"];', ['agentConclusion.summary']],
      [
        "modelTrace['tokenUsage']",
        "const value = modelTrace['tokenUsage'];",
        ['modelTrace.tokenUsage'],
      ],
    ],
  },
  {
    name: 'declaration destructuring cases',
    cases: [
      ['metadata provider shorthand', 'const { provider } = metadata;', ['metadata.provider']],
      ['metadata provider alias', 'const { provider: p } = metadata;', ['metadata.provider']],
      ['metadata provider default', 'const { provider = defaultProvider } = metadata;', ['metadata.provider']],
      ['metadata provider alias default', 'const { provider: p = defaultProvider } = metadata;', ['metadata.provider']],
      ['metadata usage shorthand', 'let { usage } = metadata;', ['metadata.usage']],
      ['metadata usage alias', 'const { usage: canonicalUsage } = metadata;', ['metadata.usage']],
      ['metadata cost estimate', 'var { costEstimate } = metadata;', ['metadata.costEstimate']],
      ['metadata conclusion source', 'const { conclusionSource } = metadata;', ['metadata.conclusionSource']],
      ['metadata fallback reason', 'const { fallbackReason } = metadata;', ['metadata.fallbackReason']],
      ['metadata model error type', 'const { modelErrorType } = metadata;', ['metadata.modelErrorType']],
      ['metadata client run id', 'const { clientRunId } = metadata;', ['metadata.clientRunId']],
      ['metadata selected model id', 'const { selectedModelId } = metadata;', ['metadata.selectedModelId']],
      ['agent conclusion source', 'const { source } = agentConclusion;', ['agentConclusion.source']],
      [
        'agent conclusion conclusionSource',
        'const { conclusionSource } = agentConclusion;',
        ['agentConclusion.conclusionSource'],
      ],
      ['agent conclusion fallbackReason', 'const { fallbackReason } = agentConclusion;', ['agentConclusion.fallbackReason']],
      ['agent conclusion content alias', 'const { content: markdown = "" } = agentConclusion;', ['agentConclusion.content']],
      ['agent conclusion summary', 'const { summary } = agentConclusion;', ['agentConclusion.summary']],
      ['model trace token usage', 'const { tokenUsage } = modelTrace;', ['tokenUsage', 'modelTrace.tokenUsage']],
    ],
  },
  {
    name: 'assignment destructuring cases',
    cases: [
      ['metadata provider assignment', '({ provider } = metadata);', ['metadata.provider']],
      ['metadata usage alias assignment', '({ usage: canonicalUsage } = metadata);', ['metadata.usage']],
      ['metadata cost assignment', '({ costEstimate } = metadata);', ['metadata.costEstimate']],
      ['metadata fallback assignment', '({ fallbackReason: reason = null } = metadata);', ['metadata.fallbackReason']],
      ['agent conclusion source assignment', '({ source } = agentConclusion);', ['agentConclusion.source']],
      ['agent conclusion content assignment', '({ content: markdown } = agentConclusion);', ['agentConclusion.content']],
      ['model trace token assignment', '({ tokenUsage } = modelTrace);', ['tokenUsage', 'modelTrace.tokenUsage']],
      ['metadata model error assignment', '({ modelErrorType } = metadata);', ['metadata.modelErrorType']],
    ],
  },
  {
    name: 'nested destructuring cases',
    cases: [
      ['nested metadata provider', 'const { metadata: { provider } } = run;', ['metadata.provider']],
      [
        'nested metadata usage alias',
        'const { metadata: { usage: canonicalUsage } } = run;',
        ['metadata.usage'],
      ],
      ['nested metadata cost estimate', 'const { metadata: { costEstimate } } = run;', ['metadata.costEstimate']],
      ['nested agent conclusion source', 'const { agentConclusion: { source } } = run;', ['agentConclusion.source']],
      ['nested model trace token', 'const { modelTrace: { tokenUsage } } = run;', ['tokenUsage', 'modelTrace.tokenUsage']],
      ['nested assignment metadata provider', '({ metadata: { provider } } = run);', ['metadata.provider']],
    ],
  },
  {
    name: 'parameter destructuring cases',
    cases: [
      ['parameter metadata provider', 'function render({ metadata: { provider } }) {}', ['metadata.provider']],
      ['parameter metadata usage', 'function render({ metadata: { usage } }) {}', ['metadata.usage']],
      ['parameter agent conclusion source', 'function render({ agentConclusion: { source } }) {}', ['agentConclusion.source']],
      [
        'arrow parameter model trace token',
        'const render = ({ modelTrace: { tokenUsage } }) => tokenUsage;',
        ['tokenUsage', 'modelTrace.tokenUsage'],
      ],
    ],
  },
  {
    name: 'rawRun mock fallback direct cases',
    cases: [
      [
        'rawRun conclusionSource nullish mock',
        "const source = rawRun.conclusionSource ?? 'mock';",
        ["rawRun.conclusionSource ?? 'mock'"],
      ],
      [
        'rawRun optional conclusionSource nullish mock',
        "const source = rawRun?.conclusionSource ?? 'mock';",
        ["rawRun.conclusionSource ?? 'mock'"],
      ],
      [
        'rawRun bracket conclusionSource nullish mock',
        "const source = rawRun['conclusionSource'] ?? 'mock';",
        ["rawRun.conclusionSource ?? 'mock'"],
      ],
      [
        'rawRun optional bracket conclusionSource nullish mock',
        "const source = rawRun?.['conclusionSource'] ?? 'mock';",
        ["rawRun.conclusionSource ?? 'mock'"],
      ],
    ],
  },
  {
    name: 'rawRun mock fallback alias cases',
    cases: [
      [
        'rawRun declaration alias same file',
        "const { conclusionSource } = rawRun;\nfunction read() { return conclusionSource ?? 'mock'; }",
        ["rawRun.conclusionSource ?? 'mock'"],
      ],
      [
        'rawRun declaration renamed alias same file',
        "const { conclusionSource: source } = rawRun;\nconst finalSource = source ?? 'mock';",
        ["rawRun.conclusionSource ?? 'mock'"],
      ],
      [
        'rawRun assignment alias same file',
        "({ conclusionSource } = rawRun);\nconst source = conclusionSource ?? 'mock';",
        ["rawRun.conclusionSource ?? 'mock'"],
      ],
      [
        'rawRun nested declaration alias same file',
        "const { rawRun: { conclusionSource: source } } = state;\nreturn source ?? 'mock';",
        ["rawRun.conclusionSource ?? 'mock'"],
      ],
    ],
  },
  {
    name: 'dynamic computed access fail-closed cases',
    cases: [
      ['metadata dynamic key', 'const value = metadata[field];', ['metadata[dynamic]']],
      ['agentConclusion dynamic key', 'const value = agentConclusion[key];', ['agentConclusion[dynamic]']],
      ['modelTrace dynamic key', 'const value = modelTrace[key];', ['modelTrace[dynamic]']],
      ['rawRun dynamic key', 'const value = rawRun[key];', ['rawRun[dynamic]']],
    ],
  },
  {
    name: 'allowed canonical cases',
    cases: [
      ['metadata providerLabel dot', 'const label = metadata.providerLabel;', []],
      ["metadata providerLabel bracket", "const label = metadata['providerLabel'];", []],
      ['metadata providerLabel destructuring', 'const { providerLabel } = metadata;', []],
      ['modelTrace usage dot', 'const usage = modelTrace.usage;', []],
      ['modelTrace conclusionSource dot', 'const source = modelTrace.conclusionSource;', []],
      ['modelTrace fallbackReason dot', 'const reason = modelTrace.fallbackReason;', []],
      ['modelTrace modelErrorType dot', 'const type = modelTrace.modelErrorType;', []],
      ['modelTrace allowed destructuring', 'const { usage, conclusionSource } = modelTrace;', []],
      ['agentConclusion notice dot', 'const notice = agentConclusion.notice;', []],
      ['agentConclusion notice destructuring', 'const { notice } = agentConclusion;', []],
      ['rawRun unknown fallback', "const source = rawRun?.conclusionSource ?? 'unknown';", []],
      ['safe unrelated object dynamic', 'const value = otherObject[key];', []],
    ],
  },
];

const failures = [];
let checked = 0;

for (const group of groups) {
  for (const [name, code, expectedLabels] of group.cases) {
    checked += 1;
    const actualLabels = findForbiddenMatchesInContent(`${group.name}/${name}.ts`, code, rules).map((match) => match.label);
    const missing = expectedLabels.filter((label) => !actualLabels.includes(label));
    const unexpected = actualLabels.filter((label) => !expectedLabels.includes(label));

    if (missing.length > 0 || unexpected.length > 0) {
      failures.push({
        actualLabels,
        expectedLabels,
        group: group.name,
        missing,
        name,
        unexpected,
      });
    }
  }
}

if (failures.length > 0) {
  console.error('Data Contract self-test failed:');
  for (const failure of failures) {
    console.error(`- ${failure.group}: ${failure.name}`);
    console.error(`  expected labels: ${JSON.stringify(failure.expectedLabels)}`);
    console.error(`  actual labels: ${JSON.stringify(failure.actualLabels)}`);
    console.error(`  missing: ${JSON.stringify(failure.missing)}`);
    console.error(`  unexpected: ${JSON.stringify(failure.unexpected)}`);
  }
  process.exit(1);
}

console.log(`Data Contract self-test passed. ${checked} cases checked.`);
