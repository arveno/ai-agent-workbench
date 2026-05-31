// Compatibility barrel for normalized run event boundary types only.
// Canonical RunSnapshot must be imported from contracts/generated/workbench-contract.
// UI-safe RunViewModel must be imported from domain/run/view-model.
export type {
  NormalizedRunEvent,
  RunChartReadyEvent,
  RunCompletedEvent,
  RunConclusionCompletedEvent,
  RunConclusionDeltaEvent,
  RunEvent,
  RunEventBoundaryInput,
  RunEventType,
  RunFailedEvent,
  RunRagSourcesReadyEvent,
  RunReportPendingEvent,
  RunReusedEvent,
  RunStartedEvent,
  RunStartedPayload,
  RunStepCompletedEvent,
  RunStepFailedEvent,
  RunStepStartedEvent,
  RunStoppedEvent,
  RunToolCompletedEvent,
  RunToolFailedEvent,
  RunToolStartedEvent,
} from '../domain/run/boundary';
