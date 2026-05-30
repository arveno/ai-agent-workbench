import type { NormalizedRunEvent } from '@/domain/run/boundary';
import type { RunSource } from '@/types/rag';

type RunSourcesEvent = Extract<NormalizedRunEvent, { type: 'rag_sources_ready' }>;

export function reduceRunSources(event: RunSourcesEvent): RunSource[] {
  return event.sources;
}
