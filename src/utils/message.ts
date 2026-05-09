import type { WorkbenchMessage } from '../types/workbench';

export function createMessageId(role: WorkbenchMessage['role']): string {
  return `m_${role}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
