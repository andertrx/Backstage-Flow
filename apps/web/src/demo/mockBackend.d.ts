/**
 * Tipos do Supabase simulado (mockBackend.js). O "banco" é uma memória com as
 * mesmas colunas das tabelas reais.
 */
type Row = Record<string, unknown>;

export interface MockDb {
  profiles: Row[];
  clients: Row[];
  access: Row[];
  connections: Row[];
  adAccounts: Row[];
  metaAccounts: Row[];
  googleAccounts: Row[];
  campaigns: Row[];
  adGroups: Row[];
  ads: Row[];
  entityChanges: Row[];
  metrics: Row[];
  snapshots: Record<string, Row>;
  fundingApi: Record<string, Row>;
  alerts: Row[];
  syncState: Record<string, Row>;
  syncRuns: Row[];
  audit: Row[];
  coverage: Record<string, Row>;
  errorLogs: Row[];
  trackingContainers: Row[];
  trackingTouchpoints: Row[];
  trackingEvents: Row[];
  trackingLeads: Row[];
  trackingPurchases: Row[];
  trackingJourneys: Record<string, Row[]>;
  [key: string]: unknown;
}

export interface MockUser {
  role?: string;
  userId?: string;
  email?: string;
  fullName?: string;
}

export interface MockRequest {
  url: string;
  method: string;
  body?: string | null;
}

export interface MockResponse {
  status: number;
  body?: string;
}

export const USER_ID: string;
export function createMockDb(user?: MockUser): MockDb;
export function createMockBackend(
  db: MockDb,
  options?: MockUser & { password?: string | null },
): (req: MockRequest) => Promise<MockResponse>;
