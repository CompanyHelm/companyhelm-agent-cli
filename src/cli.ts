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

function createProgram(): Command {
  const program = new Command();

  return program
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
}

function findBestHelpCommand(program: Command, args: string[]): Command {
  let currentCommand = program;

  for (const arg of args) {
    if (arg.startsWith("-")) {
      break;
    }

    const nextCommand = currentCommand.commands.find((childCommand) =>
      childCommand.name() === arg || childCommand.aliases().includes(arg));

    if (!nextCommand) {
      break;
    }

    currentCommand = nextCommand;
  }

  return currentCommand;
}

async function run(program: Command): Promise<void> {
  registerCommands(program);
  await program.parseAsync(process.argv);
}

const program = createProgram();

run(program).catch((error: unknown) => {
  if (error instanceof CommanderError) {
    if (error.code === "commander.helpDisplayed" || error.code === "commander.version") {
      process.exitCode = 0;
      return;
    }

    const helpCommand = findBestHelpCommand(program, process.argv.slice(2));
    process.stdout.write(helpCommand.helpInformation());
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
