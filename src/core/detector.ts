import path from "node:path";
import { readFile } from "node:fs/promises";

import { exists, isExecutableInPath } from "../utils/fs.js";
import type { AgentflowProject, ToolId } from "./schema.js";

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

export async function detectProject(cwd: string): Promise<AgentflowProject> {
  // Read package.json if present
  let pkg: Record<string, unknown> = {};
  try {
    const raw = await readFile(path.join(cwd, "package.json"), "utf-8");
    pkg = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // not a Node project
  }

  const deps = {
    ...((pkg.dependencies as Record<string, string>) ?? {}),
    ...((pkg.devDependencies as Record<string, string>) ?? {}),
  };

  // Detect language
  let language = "JavaScript";
  const hasTsConfig = await exists(path.join(cwd, "tsconfig.json"));
  const hasPyProject = await exists(path.join(cwd, "pyproject.toml"));
  const hasSetupPy = await exists(path.join(cwd, "setup.py"));
  const hasGoMod = await exists(path.join(cwd, "go.mod"));
  const hasCargoToml = await exists(path.join(cwd, "Cargo.toml"));
  const hasGemfile = await exists(path.join(cwd, "Gemfile"));

  if (hasTsConfig || "typescript" in deps) {
    language = "TypeScript";
  } else if (hasPyProject || hasSetupPy) {
    language = "Python";
  } else if (hasGoMod) {
    language = "Go";
  } else if (hasCargoToml) {
    language = "Rust";
  } else if (hasGemfile) {
    language = "Ruby";
  }

  // Detect framework
  let framework = "None";
  if (language === "TypeScript" || language === "JavaScript") {
    if ("next" in deps) framework = "Next.js";
    else if ("nuxt" in deps || "nuxt3" in deps) framework = "Nuxt";
    else if ("@nestjs/core" in deps) framework = "NestJS";
    else if ("fastify" in deps) framework = "Fastify";
    else if ("express" in deps) framework = "Express";
    else if ("hono" in deps) framework = "Hono";
    else if ("@remix-run/node" in deps || "@remix-run/react" in deps) framework = "Remix";
    else if ("react" in deps) framework = "React";
    else if ("vue" in deps) framework = "Vue";
    else if ("svelte" in deps) framework = "Svelte";
  } else if (language === "Python") {
    if (hasPyProject) {
      try {
        const pyproj = await readFile(path.join(cwd, "pyproject.toml"), "utf-8");
        if (pyproj.includes("fastapi")) framework = "FastAPI";
        else if (pyproj.includes("django")) framework = "Django";
        else if (pyproj.includes("flask")) framework = "Flask";
      } catch { /* ignore */ }
    }
  }

  return { language, framework };
}

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
