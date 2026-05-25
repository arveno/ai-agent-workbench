const { Annotation, END, START, StateGraph } = require('@langchain/langgraph');

const SKELETON_RUNTIME_VERSION = 'langgraph-runtime-skeleton-v1';

const NODE_PLANNING = 'planning';
const NODE_PROCESSING = 'processing';

const NODE_EVENT_CONFIG = {
  [NODE_PLANNING]: {
    stepId: 'langgraph_planning',
    title: 'LangGraph 规划节点',
    description: '生成最小 normalized plan，不调用正式 Tool / Retriever。',
  },
  [NODE_PROCESSING]: {
    stepId: 'langgraph_processing',
    title: 'LangGraph 处理节点',
    description: '生成 skeleton response，不调用模型、Tool 或 Retriever。',
  },
};

const RunStateAnnotation = Annotation.Root({
  runId: Annotation(),
  conversationId: Annotation(),
  clientMessageId: Annotation(),
  clientRunId: Annotation(),
  selectedModelId: Annotation(),
  userInput: Annotation(),
  normalizedIntent: Annotation(),
  normalizedPlan: Annotation(),
  toolInvocationState: Annotation(),
  ragSourceState: Annotation(),
  modelResponseState: Annotation(),
  reportState: Annotation(),
  errorState: Annotation(),
  fallbackState: Annotation(),
  usageCostState: Annotation(),
  externalIds: Annotation(),
  responseText: Annotation(),
});

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRequiredString(value, fieldName) {
  const stringValue = typeof value === 'string' ? value.trim() : '';

  if (!stringValue) {
    throw new Error(`Missing LangGraph skeleton field: ${fieldName}.`);
  }

  return stringValue;
}

function readOptionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function nowIso() {
  return new Date().toISOString();
}

function createInitialRunState(input) {
  const runId = readRequiredString(input?.runId, 'runId');
  const userInput = readRequiredString(input?.userInput, 'userInput');

  return {
    runId,
    conversationId: readOptionalString(input?.conversationId),
    clientMessageId: readOptionalString(input?.clientMessageId),
    clientRunId: readOptionalString(input?.clientRunId),
    selectedModelId: readOptionalString(input?.selectedModelId),
    userInput,
    normalizedIntent: 'unknown',
    normalizedPlan: [],
    toolInvocationState: {
      status: 'not_started',
      reason: 'skeleton_does_not_migrate_tools',
    },
    ragSourceState: {
      status: 'not_started',
      reason: 'skeleton_does_not_migrate_retriever',
    },
    modelResponseState: {
      status: 'not_started',
      reason: 'skeleton_does_not_call_model',
    },
    reportState: {
      status: 'hidden',
      reason: 'skeleton_does_not_generate_report',
    },
    errorState: null,
    fallbackState: null,
    usageCostState: {
      status: 'not_tracked',
      reason: 'skeleton_does_not_consume_quota',
    },
    externalIds: {
      langGraphThreadId: readOptionalString(input?.langGraphThreadId),
      langGraphCheckpointId: null,
      langGraphNodeId: null,
      langSmithTraceId: null,
    },
    responseText: '',
  };
}

async function planningNode(state) {
  return {
    normalizedIntent: 'skeleton_runtime_check',
    normalizedPlan: [
      {
        nodeId: NODE_PLANNING,
        label: 'Normalize minimal run intent',
      },
      {
        nodeId: NODE_PROCESSING,
        label: 'Produce canonical skeleton response',
      },
    ],
  };
}

async function processingNode(state) {
  const responseText = [
    'LangGraph Runtime Skeleton completed.',
    `runId=${state.runId}`,
    'Tool, Retriever, LangSmith and main entry migration are intentionally deferred.',
  ].join(' ');

  return {
    modelResponseState: {
      status: 'completed',
      source: 'langgraph_runtime_skeleton',
      conclusionSource: 'mock',
    },
    responseText,
  };
}

function createLangGraphRuntimeSkeleton() {
  return new StateGraph(RunStateAnnotation)
    .addNode(NODE_PLANNING, planningNode)
    .addNode(NODE_PROCESSING, processingNode)
    .addEdge(START, NODE_PLANNING)
    .addEdge(NODE_PLANNING, NODE_PROCESSING)
    .addEdge(NODE_PROCESSING, END)
    .compile();
}

function createMappingContext(initialState) {
  return {
    runId: initialState.runId,
    conversationId: initialState.conversationId,
    clientRunId: initialState.clientRunId,
    selectedModelId: initialState.selectedModelId,
    userInput: initialState.userInput,
    startedAt: Date.now(),
    nodeStartedAt: new Map(),
    sequence: 0,
  };
}

function nextSequence(context) {
  context.sequence += 1;
  return context.sequence;
}

function createMetadata(rawEvent, nodeName) {
  const metadata = isRecord(rawEvent.metadata) ? rawEvent.metadata : {};

  return {
    source: SKELETON_RUNTIME_VERSION,
    langGraphEvent: typeof rawEvent.event === 'string' ? rawEvent.event : null,
    langGraphNode: nodeName,
    langGraphStep: metadata.langgraph_step ?? null,
    langGraphCheckpointId: metadata.langgraph_checkpoint_ns || metadata.checkpoint_ns || null,
  };
}

function createRunSnapshot(state, timestamp) {
  return {
    id: state.runId,
    clientRunId: state.clientRunId || undefined,
    mode: 'agent',
    status: 'running',
    intent: state.normalizedIntent || 'unknown',
    prompt: state.userInput,
    plan: {
      intent: state.normalizedIntent || 'unknown',
      shouldUseDataAnalysis: false,
      reason: 'LangGraph runtime skeleton only.',
    },
    dataSource: {
      provider: 'mock',
      name: 'LangGraph Runtime Skeleton',
      typeLabel: 'Runtime skeleton',
    },
    steps: [],
    toolInvocations: [],
    conclusion: '',
    conclusionSource: 'none',
    reportState: 'hidden',
    createdAt: timestamp,
    updatedAt: timestamp,
    startedAt: timestamp,
  };
}

function createRunStartedEvent(state, context) {
  const timestamp = nowIso();

  return {
    type: 'run_started',
    runId: state.runId,
    clientRunId: state.clientRunId,
    conversationId: state.conversationId,
    timestamp,
    run: createRunSnapshot(state, timestamp),
    metadata: {
      source: SKELETON_RUNTIME_VERSION,
      sequence: nextSequence(context),
    },
  };
}

function createStepStartedEvent(context, rawEvent, nodeName) {
  const config = NODE_EVENT_CONFIG[nodeName];
  const startedAt = nowIso();

  context.nodeStartedAt.set(nodeName, Date.now());

  return {
    type: 'step_started',
    runId: context.runId,
    stepId: config.stepId,
    title: config.title,
    description: config.description,
    startedAt,
    metadata: {
      ...createMetadata(rawEvent, nodeName),
      sequence: nextSequence(context),
    },
  };
}

function createStepCompletedEvent(context, rawEvent, nodeName) {
  const config = NODE_EVENT_CONFIG[nodeName];
  const startedAt = context.nodeStartedAt.get(nodeName) || Date.now();

  return {
    type: 'step_completed',
    runId: context.runId,
    stepId: config.stepId,
    completedAt: nowIso(),
    elapsedMs: Math.max(Date.now() - startedAt, 1),
    metadata: {
      ...createMetadata(rawEvent, nodeName),
      sequence: nextSequence(context),
    },
  };
}

function createResponseEvent(context, rawEvent) {
  const output = isRecord(rawEvent.data?.output) ? rawEvent.data.output : {};
  const conclusion = typeof output.responseText === 'string' ? output.responseText : '';

  if (!conclusion) {
    return null;
  }

  return {
    type: 'conclusion_completed',
    runId: context.runId,
    conclusion,
    conclusionSource: 'mock',
    conclusionNotice: 'LangGraph Runtime Skeleton response; no model, Tool, Retriever or LangSmith call was made.',
    modelTrace: {
      selectedModelId: context.selectedModelId,
      provider: null,
      model: null,
      latencyMs: null,
      tokenUsage: null,
      fallbackReason: null,
      modelErrorType: null,
      conclusionSource: 'mock',
    },
    metadata: {
      ...createMetadata(rawEvent, NODE_PROCESSING),
      sequence: nextSequence(context),
    },
  };
}

function createRunCompletedEvent(finalState, context) {
  return {
    type: 'run_completed',
    runId: context.runId,
    completedAt: nowIso(),
    elapsedMs: Math.max(Date.now() - context.startedAt, 1),
    modelTrace: {
      selectedModelId: context.selectedModelId,
      provider: null,
      model: null,
      latencyMs: null,
      tokenUsage: null,
      fallbackReason: null,
      modelErrorType: null,
      conclusionSource: 'mock',
    },
    metadata: {
      source: SKELETON_RUNTIME_VERSION,
      sequence: nextSequence(context),
      normalizedIntent: finalState.normalizedIntent || 'unknown',
    },
  };
}

function getLangGraphNodeName(rawEvent) {
  const metadata = isRecord(rawEvent.metadata) ? rawEvent.metadata : {};
  const nodeName = typeof metadata.langgraph_node === 'string' ? metadata.langgraph_node : rawEvent.name;

  return NODE_EVENT_CONFIG[nodeName] ? nodeName : null;
}

function mapLangGraphEventToCanonicalEvents(rawEvent, context) {
  const nodeName = getLangGraphNodeName(rawEvent);

  if (!nodeName) {
    return [];
  }

  if (rawEvent.event === 'on_chain_start') {
    return [createStepStartedEvent(context, rawEvent, nodeName)];
  }

  if (rawEvent.event !== 'on_chain_end') {
    return [];
  }

  const events = [createStepCompletedEvent(context, rawEvent, nodeName)];
  const responseEvent = nodeName === NODE_PROCESSING ? createResponseEvent(context, rawEvent) : null;

  if (responseEvent) {
    events.push(responseEvent);
  }

  return events;
}

async function runLangGraphRuntimeSkeleton(input) {
  const initialState = createInitialRunState(input);
  const graph = createLangGraphRuntimeSkeleton();
  const mappingContext = createMappingContext(initialState);
  const canonicalEvents = [createRunStartedEvent(initialState, mappingContext)];
  let finalState = initialState;

  for await (const rawEvent of graph.streamEvents(initialState, { version: 'v2' })) {
    if (rawEvent.event === 'on_chain_end' && rawEvent.name === 'LangGraph' && isRecord(rawEvent.data?.output)) {
      finalState = {
        ...initialState,
        ...rawEvent.data.output,
      };
    }

    canonicalEvents.push(...mapLangGraphEventToCanonicalEvents(rawEvent, mappingContext));
  }

  canonicalEvents.push(createRunCompletedEvent(finalState, mappingContext));

  return {
    runtime: SKELETON_RUNTIME_VERSION,
    finalState,
    canonicalEvents,
  };
}

function describeLangGraphRuntimeSkeletonBoundary() {
  return {
    keep: [
      'CloudBase HTTP Function keeps Auth, run creation, quota, persistence and SSE boundary.',
      'Frontend continues to consume canonical events and ViewModel only.',
      'Tool / Retriever / LangSmith migrations remain separate follow-up issues.',
    ],
    deleteLater: [
      'Hand-written planner / processing inside workbench-agent-run-stream after main entry switches to LangGraph.',
      'Old modelGateway call chain after LangChain model layer is connected.',
      'Legacy mock/basic runtime residues after LangGraph path becomes the single main runtime.',
    ],
  };
}

module.exports = {
  SKELETON_RUNTIME_VERSION,
  createInitialRunState,
  createLangGraphRuntimeSkeleton,
  describeLangGraphRuntimeSkeletonBoundary,
  mapLangGraphEventToCanonicalEvents,
  runLangGraphRuntimeSkeleton,
};
