import type { AgentId, AgentflowRuntimeConfig, ProviderId } from "./config.js";

/**
 * Resolve the effective provider for a role.
 * Resolution order: CLI --provider > role default provider
 */
export function resolveProvider(
  role: AgentId,
  config: AgentflowRuntimeConfig,
  cliProvider?: ProviderId,
): ProviderId {
  return cliProvider ?? config.roles[role]!.provider;
}

/**
 * Resolve the effective model for a role and provider.
 * Resolution order: CLI --model > providerModels[provider] > role default model
 */
export function resolveModel(
  role: AgentId,
  provider: ProviderId,
  config: AgentflowRuntimeConfig,
  cliModel?: string,
): string {
  if (cliModel) return cliModel;
  const roleConfig = config.roles[role]!;
  const providerModel = roleConfig.providerModels[provider];
  if (providerModel) return providerModel;
  return roleConfig.model;
}

/**
 * Resolve the effective prompt for a role and provider.
 * Merges base prompt with provider-specific override if present.
 */
export function resolvePrompt(
  role: AgentId,
  provider: ProviderId,
  config: AgentflowRuntimeConfig,
): string {
  const roleConfig = config.roles[role]!;
  const override = roleConfig.prompt.providerOverrides[provider];
  return override ?? roleConfig.prompt.base;
}
