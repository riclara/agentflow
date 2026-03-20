import chalk from "chalk";

export type FileAction = "CREATE" | "OVERWRITE" | "MERGE" | "SKIP";

function colorForAction(action: FileAction): (value: string) => string {
  switch (action) {
    case "CREATE":
      return chalk.green;
    case "OVERWRITE":
      return chalk.yellow;
    case "MERGE":
      return chalk.cyan;
    case "SKIP":
      return chalk.gray;
  }
}

export function formatAction(action: FileAction, targetPath: string, detail?: string): string {
  const label = colorForAction(action)(action.padEnd(9));
  return detail ? `${label} ${targetPath} ${chalk.gray(detail)}` : `${label} ${targetPath}`;
}

export function info(message: string): void {
  console.log(chalk.blue("ℹ"), message);
}

export function success(message: string): void {
  console.log(chalk.green("✓"), message);
}

export function warn(message: string): void {
  console.warn(chalk.yellow("!"), message);
}

export function error(message: string): void {
  console.error(chalk.red("✗"), message);
}

export function header(message: string): void {
  console.log(chalk.bold(message));
}
