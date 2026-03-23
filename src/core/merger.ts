import type { AgentflowConfig } from "./schema.js";

export const START_MARKER = "<!-- agentflow:start -->";
export const END_MARKER = "<!-- agentflow:end -->";

const VERSION_COMMENT_PATTERNS = [
  /^\s*<!-- agentflow:v[^\n]+ -->\n?/m,
  /^\s*# agentflow:v[^\n]+\n?/m,
];

export function mergeMarkedSection(existingContent: string, generatedSection: string): string {
  const section = generatedSection.trim();
  const markerPattern = new RegExp(`${escapeForRegExp(START_MARKER)}[\\s\\S]*?${escapeForRegExp(END_MARKER)}`, "m");

  if (markerPattern.test(existingContent)) {
    return `${existingContent.replace(markerPattern, section).replace(/\s+$/, "")}\n`;
  }

  const trimmed = existingContent.trimEnd();
  if (!trimmed) {
    return `${section}\n`;
  }

  return `${trimmed}\n\n${section}\n`;
}

export function stripAgentflowMarkers(content: string): string {
  return content
    .replace(new RegExp(`^${escapeForRegExp(START_MARKER)}\\n?`, "m"), "")
    .replace(new RegExp(`\\n?${escapeForRegExp(END_MARKER)}\\s*$`, "m"), "")
    .replace(new RegExp(`\\n${escapeForRegExp(END_MARKER)}\\n?`, "m"), "\n")
    .replace(new RegExp(`${escapeForRegExp(START_MARKER)}\\n?`, "g"), "")
    .replace(new RegExp(`\\n?${escapeForRegExp(END_MARKER)}`, "g"), "")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()
    .concat("\n");
}

export function stripVersionComment(content: string): string {
  let next = content;
  for (const pattern of VERSION_COMMENT_PATTERNS) {
    next = next.replace(pattern, "");
  }
  return next.replace(/^\n+/, "");
}

export function mergeOpencodeJson(existingContent: string | null, agentsSection: Record<string, { path: string }>): string {
  const base = existingContent?.trim() ? (JSON.parse(existingContent) as Record<string, unknown>) : {};
  const merged = {
    ...base,
    agent: {
      ...(((base.agent as Record<string, unknown> | undefined) ?? {}) as Record<string, { path: string }>),
      ...agentsSection,
    },
  };
  delete (merged as Record<string, unknown>).agents;

  return `${JSON.stringify(merged, null, 2)}\n`;
}

const CODEX_AGENTS = [
  { role: "planner", description: "Senior software architect that creates plans and reviews code. Only writes to docs/features/." },
  { role: "implementer", description: "Software developer that executes implementation tasks from plans" },
  { role: "tester", description: "QA engineer that writes and runs tests" },
  { role: "documenter", description: "Technical writer that documents tested and approved code" },
];

export function mergeCodexConfig(existingContent: string | null): string {
  const agentBlocks = CODEX_AGENTS.map(
    ({ role, description }) =>
      `[agents.${role}]\ndescription = "${description}"\nconfig_file = ".codex/agents/${role}.toml"`,
  ).join("\n\n");

  if (!existingContent?.trim()) {
    return `${agentBlocks}\n`;
  }

  // Strip old [agents] directory format and any existing [agents.*] subsections
  const stripped = existingContent
    .replace(/\n?\[agents\]\ndirectory = "[^"]*"\n?/g, "")
    .replace(/\n?\[agents\.[^\]]+\][^\[]*(?=\n\[|\s*$)/g, "")
    .trimEnd();

  return `${stripped}\n\n${agentBlocks}\n`;
}

export function extractModelFromFile(content: string): string | undefined {
  const yamlMatch = content.match(/^\s*model:\s*([^\n]+)\s*$/m);
  if (yamlMatch?.[1]) {
    return yamlMatch[1].trim().replace(/^['"]|['"]$/g, "");
  }

  const tomlMatch = content.match(/^\s*model\s*=\s*"([^"]+)"\s*$/m);
  if (tomlMatch?.[1]) {
    return tomlMatch[1];
  }

  return undefined;
}

export function buildManagedFilesMap(config: AgentflowConfig, paths: string[]): Record<string, string> {
  return paths.reduce<Record<string, string>>((accumulator, targetPath) => {
    const isPartial = targetPath === "CLAUDE.md" || targetPath === "AGENTS.md" || targetPath === "opencode.json";
    accumulator[targetPath] = isPartial ? "partial" : config.version;
    return accumulator;
  }, {});
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
