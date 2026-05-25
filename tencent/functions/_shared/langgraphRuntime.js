const { Annotation, END, START, StateGraph } = require('@langchain/langgraph');

const LANGGRAPH_RUNTIME_VERSION = 'langgraph-agent-run-v1';

const NODE_PLANNING = 'planning';
const NODE_PROCESSING = 'processing';

const AgentRunStateAnnotation = Annotation.Root({
  runId: Annotation(),
  conversationId: Annotation(),
  clientMessageId: Annotation(),
  clientRunId: Annotation(),
  selectedModelId: Annotation(),
  userInput: Annotation(),
  normalizedIntent: Annotation(),
  normalizedPlan: Annotation(),
  plan: Annotation(),
  planSnapshot: Annotation(),
  dataSourceSnapshot: Annotation(),
  toolInvocationState: Annotation(),
  ragSourceState: Annotation(),
  modelResponseState: Annotation(),
  reportState: Annotation(),
  errorState: Annotation(),
  fallbackState: Annotation(),
  usageCostState: Annotation(),
  externalIds: Annotation(),
  responseText: Annotation(),
  conclusionSource: Annotation(),
  fallbackReason: Annotation(),
  runtime: Annotation(),
});

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRequiredString(value, fieldName) {
  const stringValue = typeof value === 'string' ? value.trim() : '';

  if (!stringValue) {
    throw new Error(`Missing LangGraph runtime field: ${fieldName}.`);
  }

  return stringValue;
}

function readOptionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function createInitialAgentRunState(input) {
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
    plan: null,
    planSnapshot: {},
    dataSourceSnapshot: null,
    toolInvocationState: {
      status: 'managed_by_langchain_tools',
    },
    ragSourceState: {
      status: 'managed_by_langchain_retriever',
    },
    modelResponseState: {
      status: 'not_started',
    },
    reportState: {
      status: 'hidden',
    },
    errorState: null,
    fallbackState: null,
    usageCostState: {
      status: 'managed_by_cloudbase_boundary',
    },
    externalIds: {
      langGraphThreadId: readOptionalString(input?.langGraphThreadId) || `agent-run:${runId}`,
      langGraphCheckpointId: null,
      langGraphNodeId: null,
      langSmithTraceId: readOptionalString(input?.langSmithTraceId),
      langSmithRunId: readOptionalString(input?.langSmithRunId),
    },
    responseText: '',
    conclusionSource: 'none',
    fallbackReason: null,
    runtime: LANGGRAPH_RUNTIME_VERSION,
  };
}

function normalizeNodePatch(value) {
  return isRecord(value) ? value : {};
}

function assertRuntimeHandlers(handlers) {
  if (!isRecord(handlers)) {
    throw new Error('LangGraph runtime handlers are required.');
  }

  if (typeof handlers.planning !== 'function') {
    throw new Error('LangGraph runtime planning handler is required.');
  }

  if (typeof handlers.processing !== 'function') {
    throw new Error('LangGraph runtime processing handler is required.');
  }
}

function createLangGraphAgentRuntime(handlers) {
  assertRuntimeHandlers(handlers);

  return new StateGraph(AgentRunStateAnnotation)
    .addNode(NODE_PLANNING, async (state) => normalizeNodePatch(await handlers.planning(state)))
    .addNode(NODE_PROCESSING, async (state) => normalizeNodePatch(await handlers.processing(state)))
    .addEdge(START, NODE_PLANNING)
    .addEdge(NODE_PLANNING, NODE_PROCESSING)
    .addEdge(NODE_PROCESSING, END)
    .compile();
}

async function runLangGraphAgentRuntime(input, handlers) {
  const initialState = createInitialAgentRunState(input);
  const graph = createLangGraphAgentRuntime(handlers);
  const finalState = await graph.invoke(initialState, {
    configurable: {
      thread_id: initialState.externalIds.langGraphThreadId,
    },
  });

  return {
    runtime: LANGGRAPH_RUNTIME_VERSION,
    initialState,
    finalState,
  };
}

function describeLangGraphRuntimeBoundary() {
  return {
    runtime: LANGGRAPH_RUNTIME_VERSION,
    nodes: [NODE_PLANNING, NODE_PROCESSING],
    keep: [
      'CloudBase HTTP Function keeps Auth, quota, message persistence, run persistence and SSE HTTP boundary.',
      'Frontend continues to consume canonical SSE / Run Trace events only.',
      'Formal Tool calls run through LangChain Structured Tool definitions and keep tool_invocations as the source of truth.',
      'knowledge_search runs through a LangChain Retriever / Document boundary and keeps retrieval_logs / run_sources as the source of truth.',
      'LangSmith trace / run ids stay in externalIds / metadata and never replace canonical runId.',
    ],
    deleteLater: [
      'Old hand-written Agent Run entry orchestration after LangGraph owns the main entry.',
      'Old modelGateway call chain after LangChain model layer is connected.',
      'Legacy mock/basic runtime residues after LangGraph path becomes the single main runtime.',
    ],
  };
}

module.exports = {
  LANGGRAPH_RUNTIME_VERSION,
  NODE_PLANNING,
  NODE_PROCESSING,
  createInitialAgentRunState,
  createLangGraphAgentRuntime,
  describeLangGraphRuntimeBoundary,
  runLangGraphAgentRuntime,
};
