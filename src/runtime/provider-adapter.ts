import type { AgentId, ProviderId } from "./config.js";

export interface RunProviderInput {
  cwd: string;
  role: AgentId;
  provider: ProviderId;
  model: string;
  sandbox: "read-only" | "workspace-write";
  effort?: string;
  prompt: string;
  task: string;
  featureSlug?: string;
  traceDir: string;
  json?: boolean;
}

export interface RunRoleResult {
  ok: boolean;
  provider: ProviderId;
  role: AgentId;
  model: string;
  summary?: string;
  artifacts?: string[];
  runId?: string;
  sessionId?: string;
  code?: "validation_error" | "provider_unavailable" | "execution_failed" | "artifact_missing";
  message?: string;
  retryable?: boolean;
}

export interface ProviderAdapter {
  id: ProviderId;
  detect(cwd: string): Promise<boolean>;
  run(input: RunProviderInput): Promise<RunRoleResult>;
}
