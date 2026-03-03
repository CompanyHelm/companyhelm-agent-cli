#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command, CommanderError } from "commander";
import { registerCommands } from "./commands/register-commands.js";
import { toCliError } from "./errors.js";
import { writeJsonStderr } from "./utils/output.js";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));

function getVersion(): string {
  try {
    const packagePath = join(currentDirectory, "..", "package.json");
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as { version?: string };
    return packageJson.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function run(): Promise<void> {
  const program = new Command();

  program
    .name("companyhelm-agent")
    .description("Non-interactive CLI wrapper around CompanyHelm AgentTaskService.")
    .version(getVersion())
    .showHelpAfterError(false)
    .configureOutput({
      writeOut: (value: string): void => {
        process.stdout.write(value);
      },
      writeErr: (): void => {
        // Suppress default commander stderr output; we emit structured JSON errors.
      },
      outputError: (): void => {
        // Suppress default commander stderr output; we emit structured JSON errors.
      },
    })
    .exitOverride();

  registerCommands(program);

  await program.parseAsync(process.argv);
}

run().catch((error: unknown) => {
  if (error instanceof CommanderError) {
    if (error.code === "commander.helpDisplayed" || error.code === "commander.version") {
      process.exitCode = 0;
      return;
    }
  }

  const cliError = toCliError(error);
  writeJsonStderr({
    error: {
      code: cliError.code,
      message: cliError.message,
    },
  });

  process.exitCode = cliError.exitCode;
});
