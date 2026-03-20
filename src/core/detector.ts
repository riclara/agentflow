import path from "node:path";

import { exists, isExecutableInPath } from "../utils/fs.js";
import type { ToolId } from "./schema.js";

export interface ToolGroup {
  id: ToolId;
  label: string;
  description: string;
}

export interface ToolDetection {
  claudeCode: boolean;
  cowork: boolean;
  codexCli: boolean;
  codexApp: boolean;
  opencode: boolean;
  detectedGroups: ToolId[];
}

export const TOOL_GROUPS: ToolGroup[] = [
  {
    id: "claude-code",
    label: "Claude Code + Cowork",
    description: "Shared .claude/ skill and agent files",
  },
  {
    id: "codex",
    label: "Codex CLI + Codex App",
    description: "Shared .codex/ agents, .agents/ skill, and AGENTS.md",
  },
  {
    id: "opencode",
    label: "OpenCode",
    description: "OpenCode agents and opencode.json",
  },
];

const TOOL_SYNONYMS: Record<string, ToolId> = {
  claude: "claude-code",
  "claude-code": "claude-code",
  cowork: "claude-code",
  codex: "codex",
  "codex-cli": "codex",
  "codex-app": "codex",
  opencode: "opencode",
};

export async function detectTools(cwd: string): Promise<ToolDetection> {
  const [
    hasClaudeBinary,
    hasCodexBinary,
    hasOpenCodeBinary,
    hasClaudeDir,
    hasCodexDir,
    hasAgentsMd,
    hasOpenCodeDir,
  ] = await Promise.all([
    isExecutableInPath("claude"),
    isExecutableInPath("codex"),
    isExecutableInPath("opencode"),
    exists(path.join(cwd, ".claude")),
    exists(path.join(cwd, ".codex")),
    exists(path.join(cwd, "AGENTS.md")),
    exists(path.join(cwd, ".opencode")),
  ]);

  const claudeCode = hasClaudeBinary || hasClaudeDir;
  const cowork = claudeCode;
  const codexCli = hasCodexBinary || hasCodexDir || hasAgentsMd;
  const codexApp = codexCli;
  const opencode = hasOpenCodeBinary || hasOpenCodeDir;

  const detectedGroups: ToolId[] = [];
  if (claudeCode || cowork) {
    detectedGroups.push("claude-code");
  }
  if (codexCli || codexApp) {
    detectedGroups.push("codex");
  }
  if (opencode) {
    detectedGroups.push("opencode");
  }

  return {
    claudeCode,
    cowork,
    codexCli,
    codexApp,
    opencode,
    detectedGroups,
  };
}

export function parseToolList(rawTools: string): ToolId[] {
  const parsed = rawTools
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => TOOL_SYNONYMS[item]);

  if (parsed.some((item) => !item)) {
    throw new Error(`Unsupported tool list: "${rawTools}". Use claude-code,codex,opencode.`);
  }

  return [...new Set(parsed)].filter((item): item is ToolId => Boolean(item));
}
