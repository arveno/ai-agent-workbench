import type { ModelProviderId } from './workbench';

export type ModelKeySource =
  | 'none'
  | 'server_env';

export type ModelProviderAvailability =
  | 'available'
  | 'not_configured'
  | 'reserved'
  | 'error';

export type ModelStatusTone =
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'muted';

export interface ModelProviderStatusView {
  providerId: ModelProviderId;
  displayName: string;
  description: string;

  isActive: boolean;
  isConfigured: boolean;
  isAvailable: boolean;
  isReserved: boolean;

  keySource: ModelKeySource;
  availability: ModelProviderAvailability;

  statusLabel: string;
  statusDescription: string;
  badgeTone: ModelStatusTone;

  supportsStreaming: boolean;
  isGatewayConnected: boolean;

  capabilityLabels: string[];
}
