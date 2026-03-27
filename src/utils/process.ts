import { spawn } from "node:child_process";

export interface SpawnResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * Spawns a process with stdin closed (ignore), collecting stdout and stderr.
 * Safe to call from non-interactive contexts (background terminals, pipes).
 */
export function spawnCollect(
  cmd: string,
  args: string[],
  options: { cwd: string; maxBuffer?: number },
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const maxBuffer = options.maxBuffer ?? 10 * 1024 * 1024;
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutLen = 0;
    let stderrLen = 0;

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutLen += chunk.length;
      if (stdoutLen <= maxBuffer) stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrLen += chunk.length;
      if (stderrLen <= maxBuffer) stderrChunks.push(chunk);
    });

    child.on("error", reject);

    child.on("close", (code) => {
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
        stderr: Buffer.concat(stderrChunks).toString("utf-8"),
        code: code ?? 1,
      });
    });
  });
}

// Strip ANSI escape sequences from PTY output
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]|\x1b[()][AB012]|\r/g;

/**
 * Spawns a process inside a pseudo-terminal (PTY).
 * Required for TUI apps (e.g. codex exec) that hang or misbehave without a real terminal.
 * stdout and stderr are merged (PTY combines them); ANSI codes are stripped from the result.
 */
export async function spawnWithPty(
  cmd: string,
  args: string[],
  options: { cwd: string; maxBuffer?: number },
): Promise<SpawnResult> {
  let ptyModule: typeof import("node-pty");
  try {
    ptyModule = await import("node-pty");
  } catch {
    // node-pty not available in this environment — fall back to pipe-based spawn
    return spawnCollect(cmd, args, options);
  }

  const maxBuffer = options.maxBuffer ?? 10 * 1024 * 1024;
  const chunks: string[] = [];
  let totalLen = 0;

  const proc = ptyModule.spawn(cmd, args, {
    name: "xterm-256color",
    cols: 220,
    rows: 50,
    cwd: options.cwd,
    env: { ...process.env } as Record<string, string>,
  });

  return new Promise((resolve) => {
    proc.onData((data: string) => {
      totalLen += data.length;
      if (totalLen <= maxBuffer) chunks.push(data);
    });

    proc.onExit(({ exitCode }: { exitCode: number }) => {
      const raw = chunks.join("").replace(ANSI_RE, "");
      resolve({ stdout: raw, stderr: "", code: exitCode ?? 1 });
    });
  });
}
